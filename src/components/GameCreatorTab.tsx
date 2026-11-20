import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Gamepad2,
  Loader2,
  Lock,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  GAME_DOWNLOAD_FEE_INR,
  GAME_THEMES,
  HERO_ABILITIES,
  buildStandaloneHtmlGame,
  createDefaultGameConfig,
  findPendingGameDownloadOrder,
  hasUnlockedGameDownload,
  sanitizeSlug,
} from '../lib/gameBuilderLogic';
import { apiRequest, ApiError } from '../utils/api';
import { PlayableArcadeEngine } from './games/PlayableArcadeEngine';
import type { GameProject, GameThemeId, HeroAbilityId, Order } from '../types';

interface GameCreatorTabProps {
  games: GameProject[];
  orders: Order[];
  onGameSaved: (game: GameProject) => void;
  onGameDeleted: (id: string) => void;
  onOrderCreated: (order: Order) => void;
  onOpenPayment: (order: Order) => void;
  onAiWarning?: (msg: string) => void;
}

export const GameCreatorTab: React.FC<GameCreatorTabProps> = ({
  games,
  orders,
  onGameSaved,
  onGameDeleted,
  onOrderCreated,
  onOpenPayment,
  onAiWarning,
}) => {
  const defaults = useMemo(() => createDefaultGameConfig(), []);
  const [activeGameId, setActiveGameId] = useState<string | undefined>(games[0]?.id);
  const [title, setTitle] = useState<string>(games[0]?.title || defaults.title);
  const [subtitle, setSubtitle] = useState<string>(games[0]?.subtitle || defaults.subtitle);
  const [theme, setTheme] = useState<GameThemeId>(games[0]?.theme || defaults.theme);
  const [ability, setAbility] = useState<HeroAbilityId>(games[0]?.ability || defaults.ability);
  const [heroSpeed, setHeroSpeed] = useState<number>(games[0]?.heroSpeed || defaults.heroSpeed);
  const [enemySpawnRate, setEnemySpawnRate] = useState<number>(
    games[0]?.enemySpawnRate || defaults.enemySpawnRate,
  );
  const [difficulty, setDifficulty] = useState<'casual' | 'arcade' | 'hardcore'>(
    games[0]?.difficulty || defaults.difficulty,
  );
  const [winTargetScore, setWinTargetScore] = useState<number>(
    games[0]?.winTargetScore || defaults.winTargetScore,
  );
  const [soundEnabled, setSoundEnabled] = useState<boolean>(
    games[0]?.soundEnabled ?? defaults.soundEnabled,
  );

  const [saving, setSaving] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const currentConfig = useMemo(
    () => ({
      title,
      subtitle,
      theme,
      ability,
      heroSpeed,
      enemySpawnRate,
      difficulty,
      winTargetScore,
      soundEnabled,
    }),
    [title, subtitle, theme, ability, heroSpeed, enemySpawnRate, difficulty, winTargetScore, soundEnabled],
  );

  const gameKey = activeGameId || `draft_${sanitizeSlug(title)}`;
  const downloadUnlocked = useMemo(
    () => hasUnlockedGameDownload(orders, gameKey),
    [orders, gameKey],
  );
  const pendingOrder = useMemo(
    () => findPendingGameDownloadOrder(orders, gameKey),
    [orders, gameKey],
  );

  const handleLoadGame = (game: GameProject) => {
    setActiveGameId(game.id);
    setTitle(game.title);
    setSubtitle(game.subtitle);
    setTheme(game.theme);
    setAbility(game.ability);
    setHeroSpeed(game.heroSpeed);
    setEnemySpawnRate(game.enemySpawnRate);
    setDifficulty(game.difficulty);
    setWinTargetScore(game.winTargetScore);
    setSoundEnabled(game.soundEnabled);
    setFeedback(`Loaded "${game.title}" into Game Studio.`);
  };

  const persistDesign = async (): Promise<GameProject> => {
    const res = await apiRequest<{ game: GameProject }>('/api/games', {
      method: 'POST',
      body: JSON.stringify({
        id: activeGameId,
        ...currentConfig,
      }),
    });
    setActiveGameId(res.game.id);
    onGameSaved(res.game);
    return res.game;
  };

  const handleSaveGame = async () => {
    if (!title.trim()) {
      onAiWarning?.('Please give your game a title before saving.');
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await persistDesign();
      setFeedback(`Saved "${saved.title}" to your Game Studio library.`);
    } catch (err) {
      onAiWarning?.(err instanceof ApiError ? err.message : 'Unable to save game design.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGame = async (id: string) => {
    try {
      await apiRequest(`/api/games/${id}`, { method: 'DELETE' });
      onGameDeleted(id);
      if (activeGameId === id) {
        setActiveGameId(undefined);
      }
    } catch (err) {
      onAiWarning?.(err instanceof ApiError ? err.message : 'Unable to delete saved game.');
    }
  };

  const triggerGameBundleDownload = () => {
    const html = buildStandaloneHtmlGame(currentConfig);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeSlug(title)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    setFeedback(`Downloaded playable bundle: ${sanitizeSlug(title)}.html`);
  };

  const handleDownloadAction = async () => {
    if (downloadUnlocked) {
      triggerGameBundleDownload();
      return;
    }
    if (pendingOrder) {
      onOpenPayment(pendingOrder);
      return;
    }

    setCreatingOrder(true);
    try {
      let targetGameId = activeGameId;
      if (!targetGameId) {
        const saved = await persistDesign();
        targetGameId = saved.id;
      }
      const res = await apiRequest<{ order: Order }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          type: 'game_download',
          gameId: targetGameId || gameKey,
          gameTitle: title.trim() || 'Prime X Arcade Game',
        }),
      });
      onOrderCreated(res.order);
      onOpenPayment(res.order);
    } catch (err) {
      onAiWarning?.(
        err instanceof ApiError ? err.message : 'Unable to create ₹10 game download payment order.',
      );
    } finally {
      setCreatingOrder(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Studio Header Bar */}
      <section className="rounded-2xl border border-[#D4AF37]/30 bg-gradient-to-r from-[#0B1C36] via-[#0F2749] to-[#0B1C36] p-5 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#F5C542] mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Interactive 2D Game Builder & Export</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white flex items-center gap-2.5">
            <Gamepad2 className="w-7 h-7 text-[#F5C542]" />
            <span>PRIME X GAME STUDIO</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
            Customize your hero weapon, arena theme, enemy wave intensity, and target score—play
            live right in the browser and download your standalone HTML5 game for ₹{GAME_DOWNLOAD_FEE_INR}.
          </p>
        </div>

        {/* Download Payment Gate Card */}
        <div className="w-full lg:w-auto rounded-xl bg-[#071222]/90 border border-[#F5C542]/40 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Standalone Game Export
            </div>
            {downloadUnlocked ? (
              <div className="text-xs font-bold text-emerald-300 inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Unlocked · Ready to Download</span>
              </div>
            ) : pendingOrder ? (
              <div className="text-xs font-bold text-amber-300 inline-flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span>₹{GAME_DOWNLOAD_FEE_INR} Payment {pendingOrder.status}</span>
              </div>
            ) : (
              <div className="text-xs font-bold text-[#F5C542] inline-flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                <span>Pay ₹{GAME_DOWNLOAD_FEE_INR} UPI to Download .HTML Build</span>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={creatingOrder}
            onClick={handleDownloadAction}
            className={`px-4 py-2.5 rounded-xl font-display font-bold text-xs inline-flex items-center justify-center gap-2 transition-all shadow-md ${
              downloadUnlocked
                ? 'bg-emerald-500 hover:bg-emerald-400 text-[#05121D]'
                : 'bg-[#F5C542] hover:bg-[#D4AF37] text-[#08172C]'
            } disabled:opacity-60`}
          >
            {creatingOrder ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Starting Checkout...</span>
              </>
            ) : downloadUnlocked ? (
              <>
                <Download className="w-4 h-4" />
                <span>Download Game (.HTML)</span>
              </>
            ) : pendingOrder ? (
              <>
                <CreditCard className="w-4 h-4" />
                <span>Complete ₹{GAME_DOWNLOAD_FEE_INR} Payment</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Download Game (₹{GAME_DOWNLOAD_FEE_INR})</span>
              </>
            )}
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Game Builder Controls (4 cols) */}
        <section className="xl:col-span-4 rounded-2xl border border-white/15 bg-[#0D213F] p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-white">
              Game Parameters
            </h2>
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveGame}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-[#F5C542] inline-flex items-center gap-1.5"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>Save Design</span>
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                Game Title
              </label>
              <input
                type="text"
                value={title}
                maxLength={48}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl bg-[#08172C] border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F5C542]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                Mission Tagline
              </label>
              <input
                type="text"
                value={subtitle}
                maxLength={80}
                onChange={(e) => setSubtitle(e.target.value)}
                className="w-full rounded-xl bg-[#08172C] border border-white/15 px-3 py-2 text-xs text-white focus:outline-none focus:border-[#F5C542]"
              />
            </div>

            {/* World Theme Picker */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                World Palette Theme
              </label>
              <div className="grid grid-cols-2 gap-2">
                {Object.values(GAME_THEMES).map((t) => {
                  const active = theme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTheme(t.id)}
                      className={`p-2 rounded-xl border text-left transition-colors ${
                        active
                          ? 'bg-[#08172C] border-[#F5C542] text-white'
                          : 'bg-[#08172C]/60 border-white/10 text-slate-300 hover:border-white/30'
                      }`}
                    >
                      <div className="text-[11px] font-bold truncate">{t.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Hero Weapon Ability */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Hero Weapon Ability
              </label>
              <div className="space-y-1.5">
                {HERO_ABILITIES.map((ab) => {
                  const active = ability === ab.id;
                  return (
                    <button
                      key={ab.id}
                      type="button"
                      onClick={() => setAbility(ab.id)}
                      className={`w-full p-2.5 rounded-xl border text-left transition-colors ${
                        active
                          ? 'bg-[#08172C] border-[#F5C542]'
                          : 'bg-[#08172C]/55 border-white/10 hover:border-white/30'
                      }`}
                    >
                      <div className="text-xs font-bold text-white">{ab.label}</div>
                      <div className="text-[11px] text-slate-400">{ab.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Difficulty & Sound */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                  Difficulty
                </label>
                <select
                  value={difficulty}
                  onChange={(e) =>
                    setDifficulty(e.target.value as 'casual' | 'arcade' | 'hardcore')
                  }
                  className="w-full rounded-xl bg-[#08172C] border border-white/15 px-3 py-2 text-xs text-white focus:outline-none focus:border-[#F5C542]"
                >
                  <option value="casual">Casual</option>
                  <option value="arcade">Arcade</option>
                  <option value="hardcore">Hardcore</option>
                </select>
              </div>

              <div className="flex items-end">
                <label className="w-full flex items-center gap-2 rounded-xl bg-[#08172C] border border-white/15 px-3 py-2 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={soundEnabled}
                    onChange={(e) => setSoundEnabled(e.target.checked)}
                    className="accent-[#F5C542]"
                  />
                  <span>Web Audio SFX</span>
                </label>
              </div>
            </div>

            {/* Tuning Sliders */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="font-bold text-slate-300 uppercase">Hero Thruster Speed</span>
                <span className="font-mono text-[#F5C542] tabular-nums">{heroSpeed}</span>
              </div>
              <input
                type="range"
                min={180}
                max={440}
                step={10}
                value={heroSpeed}
                onChange={(e) => setHeroSpeed(Number(e.target.value))}
                className="w-full accent-[#F5C542]"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="font-bold text-slate-300 uppercase">Enemy Spawn Intensity</span>
                <span className="font-mono text-[#F5C542] tabular-nums">{enemySpawnRate} / 5</span>
              </div>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={enemySpawnRate}
                onChange={(e) => setEnemySpawnRate(Number(e.target.value))}
                className="w-full accent-[#F5C542]"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="font-bold text-slate-300 uppercase">Victory Target Score</span>
                <span className="font-mono text-[#F5C542] tabular-nums">{winTargetScore}</span>
              </div>
              <input
                type="range"
                min={500}
                max={5000}
                step={250}
                value={winTargetScore}
                onChange={(e) => setWinTargetScore(Number(e.target.value))}
                className="w-full accent-[#F5C542]"
              />
            </div>
          </div>

          {feedback && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              {feedback}
            </div>
          )}

          {/* Saved Games List */}
          {games.length > 0 && (
            <div className="border-t border-white/10 pt-3 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                My Saved Games ({games.length})
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {games.map((g) => (
                  <div
                    key={g.id}
                    className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 border text-xs ${
                      activeGameId === g.id
                        ? 'bg-[#08172C] border-[#F5C542]'
                        : 'bg-[#08172C]/60 border-white/10'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleLoadGame(g)}
                      className="flex-1 text-left truncate font-semibold text-white hover:text-[#F5C542]"
                    >
                      {g.title}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteGame(g.id)}
                      aria-label={`Delete ${g.title}`}
                      className="text-rose-400 hover:text-rose-300 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* RIGHT COLUMN: Live Playable Canvas Stage (8 cols) */}
        <section className="xl:col-span-8 space-y-3">
          <PlayableArcadeEngine config={currentConfig} />
        </section>
      </div>
    </div>
  );
};
