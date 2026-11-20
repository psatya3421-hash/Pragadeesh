import React, { useCallback, useEffect, useRef, useState } from 'react';
import gameBackdropImg from '../../assets/images/game_arcade_backdrop_1794710117620.jpg';
import { GAME_THEMES, HERO_ABILITIES, normalizeGameTitle } from '../../lib/gameBuilderLogic';
import type { GameProject } from '../../types';

export type ArcadeRunState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'VICTORY' | 'GAME_OVER';

interface PlayableArcadeEngineProps {
  config: Pick<
    GameProject,
    'title' | 'subtitle' | 'theme' | 'ability' | 'heroSpeed' | 'enemySpawnRate' | 'difficulty' | 'winTargetScore' | 'soundEnabled'
  >;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  pierce: number;
  fromEnemy?: boolean;
}

interface Enemy {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: 'chaser' | 'sniper' | 'charger';
  hp: number;
  maxHp: number;
  phaseTimer: number;
  windup: number;
  aimX: number;
  aimY: number;
  koTimer: number;
  flashTimer: number;
}

interface EnergyCore {
  x: number;
  y: number;
  life: number;
}

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

const ARENA_W = 960;
const ARENA_H = 540;
const PARTICLE_POOL_SIZE = 180;

export const PlayableArcadeEngine: React.FC<PlayableArcadeEngineProps> = ({ config }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  const isAutostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [runState, setRunState] = useState<ArcadeRunState>(
    isAutostart ? 'PLAYING' : 'TITLE_MENU',
  );
  const [muted, setMuted] = useState(!config.soundEnabled);
  const [hudScore, setHudScore] = useState(0);
  const [hudShield, setHudShield] = useState(3);
  const [hudWave, setHudWave] = useState(1);
  const [endSnapshot, setEndSnapshot] = useState({
    score: 0,
    wave: 1,
    defeated: 0,
  });

  const runStateRef = useRef<ArcadeRunState>(runState);
  runStateRef.current = runState;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => {
    setMuted(!config.soundEnabled);
  }, [config.soundEnabled]);

  // Mirror state to document.body.dataset.state while mounted
  useEffect(() => {
    const mapped =
      runState === 'TITLE_MENU'
        ? 'title'
        : runState === 'PLAYING'
          ? 'playing'
          : runState === 'PAUSED'
            ? 'paused'
            : 'gameover';
    document.body.dataset.state = mapped;
    return () => {
      delete document.body.dataset.state;
    };
  }, [runState]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const playTone = useCallback((freq: number, duration = 0.08, type: OscillatorType = 'triangle', gainVal = 0.08) => {
    if (mutedRef.current || typeof window === 'undefined') return;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      const jitter = 0.94 + Math.random() * 0.12;
      osc.frequency.setValueAtTime(freq * jitter, ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // AudioContext blocked until gesture
    }
  }, []);

  // Mutable simulation world (zero React allocations during 60Hz loop)
  const simRef = useRef({
    player: {
      x: ARENA_W / 2,
      y: ARENA_H - 90,
      vx: 0,
      vy: 0,
      hp: 3,
      invuln: 0,
      dashCd: 0,
      fireCd: 0,
      aimX: ARENA_W / 2,
      aimY: 0,
    },
    score: 0,
    wave: 1,
    defeated: 0,
    spawnTimer: 0.7,
    hitstop: 0,
    trauma: 0,
    elapsed: 0,
    keys: new Set<string>(),
    pointerDown: false,
    bullets: [] as Bullet[],
    enemies: [] as Enemy[],
    cores: [] as EnergyCore[],
    particles: Array.from({ length: PARTICLE_POOL_SIZE }, (): ParticleSlot => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 0.4,
      size: 3,
      color: '#F5C542',
    })),
    particleCursor: 0,
  });

  const spawnBurst = useCallback((x: number, y: number, color: string, count = 14) => {
    const sim = simRef.current;
    for (let i = 0; i < count; i++) {
      const slot = sim.particles[sim.particleCursor];
      sim.particleCursor = (sim.particleCursor + 1) % PARTICLE_POOL_SIZE;
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.35;
      const spd = 65 + Math.random() * 170;
      slot.active = true;
      slot.x = x;
      slot.y = y;
      slot.vx = Math.cos(ang) * spd;
      slot.vy = Math.sin(ang) * spd;
      slot.maxLife = 0.28 + Math.random() * 0.24;
      slot.life = slot.maxLife;
      slot.size = 2 + Math.random() * 2.5;
      slot.color = color;
    }
  }, []);

  const resetWorld = useCallback(() => {
    const sim = simRef.current;
    sim.player = {
      x: ARENA_W / 2,
      y: ARENA_H - 90,
      vx: 0,
      vy: 0,
      hp: 3,
      invuln: 0.4,
      dashCd: 0,
      fireCd: 0,
      aimX: ARENA_W / 2,
      aimY: 80,
    };
    sim.score = 0;
    sim.wave = 1;
    sim.defeated = 0;
    sim.spawnTimer = 0.6;
    sim.hitstop = 0;
    sim.trauma = 0;
    sim.elapsed = 0;
    sim.bullets.length = 0;
    sim.enemies.length = 0;
    sim.cores.length = 0;
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      sim.particles[i].active = false;
    }
    setHudScore(0);
    setHudShield(3);
    setHudWave(1);
  }, []);

  const startGame = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    simRef.current.keys.clear();
    simRef.current.pointerDown = false;
    resetWorld();
    runStateRef.current = 'PLAYING';
    setRunState('PLAYING');
    playTone(520, 0.12, 'sine', 0.08);
  }, [resetWorld, playTone]);

  // Trigger autostart once on mount if ?autostart=1
  useEffect(() => {
    if (isAutostart) {
      resetWorld();
    }
  }, [isAutostart, resetWorld]);

  // Global keyboard & focus-loss release bindings
  useEffect(() => {
    const isFormElement = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isFormElement(e.target)) return;

      if (e.code === 'KeyM') {
        setMuted((m) => !m);
        return;
      }

      if (runStateRef.current === 'TITLE_MENU') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          startGame();
        }
        return;
      }

      if ((e.code === 'KeyP' || e.code === 'Escape') && (runStateRef.current === 'PLAYING' || runStateRef.current === 'PAUSED')) {
        e.preventDefault();
        const next: ArcadeRunState = runStateRef.current === 'PLAYING' ? 'PAUSED' : 'PLAYING';
        runStateRef.current = next;
        setRunState(next);
        simRef.current.keys.clear();
        return;
      }

      if (e.code === 'KeyR') {
        e.preventDefault();
        startGame();
        return;
      }

      if (runStateRef.current === 'PLAYING') {
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
          e.preventDefault();
        }
        simRef.current.keys.add(e.code);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      simRef.current.keys.delete(e.code);
    };

    const onBlurOrHide = () => {
      simRef.current.keys.clear();
      simRef.current.pointerDown = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlurOrHide);
    document.addEventListener('visibilitychange', onBlurOrHide);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlurOrHide);
      document.removeEventListener('visibilitychange', onBlurOrHide);
    };
  }, [startGame]);

  // Main 60Hz RequestAnimationFrame Simulation & Renderer
  useEffect(() => {
    let rafId = 0;
    let lastTs = 0;

    const spawnEnemy = (cfg: PlayableArcadeEngineProps['config'], wave: number) => {
      const sim = simRef.current;
      const edge = Math.floor(Math.random() * 4);
      const x = edge === 0 ? -18 : edge === 1 ? ARENA_W + 18 : 60 + Math.random() * (ARENA_W - 120);
      const y = edge === 2 ? -18 : edge === 3 ? ARENA_H + 18 : 60 + Math.random() * (ARENA_H - 120);

      // Weighted archetype spawn mix
      const roll = Math.random();
      const kind: Enemy['kind'] =
        wave >= 2 && roll > 0.68 ? 'charger' : roll > 0.38 ? 'sniper' : 'chaser';

      const diffMult = cfg.difficulty === 'hardcore' ? 1.35 : cfg.difficulty === 'casual' ? 0.8 : 1;
      const maxHp = kind === 'charger' ? 3 : kind === 'sniper' ? 2 : 1;

      sim.enemies.push({
        x,
        y,
        vx: 0,
        vy: 0,
        kind,
        hp: maxHp,
        maxHp,
        phaseTimer: 0.9 + Math.random() * 0.7,
        windup: 0,
        aimX: sim.player.x,
        aimY: sim.player.y,
        koTimer: 0,
        flashTimer: 0,
      });
      void diffMult;
    };

    const tick = (ts: number) => {
      const rawDt = lastTs ? (ts - lastTs) / 1000 : 0.016;
      lastTs = ts;
      const dt = Math.min(rawDt, 0.05);
      const cfg = configRef.current;
      const theme = GAME_THEMES[cfg.theme] || GAME_THEMES.orbital_gold;
      const sim = simRef.current;

      // Update particles & camera trauma in real dt even during hitstop
      if (sim.trauma > 0) {
        sim.trauma = Math.max(0, sim.trauma - dt * 1.9);
      }
      for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
        const p = sim.particles[i];
        if (!p.active) continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.life -= dt;
        if (p.life <= 0) p.active = false;
      }

      if (runStateRef.current === 'PLAYING') {
        if (sim.hitstop > 0) {
          sim.hitstop = Math.max(0, sim.hitstop - dt);
        } else {
          sim.elapsed += dt;
          const pl = sim.player;
          const ax = (sim.keys.has('KeyD') || sim.keys.has('ArrowRight') ? 1 : 0) -
            (sim.keys.has('KeyA') || sim.keys.has('ArrowLeft') ? 1 : 0);
          const ay = (sim.keys.has('KeyS') || sim.keys.has('ArrowDown') ? 1 : 0) -
            (sim.keys.has('KeyW') || sim.keys.has('ArrowUp') ? 1 : 0);

          const len = Math.hypot(ax, ay) || 1;
          const nx = ax !== 0 ? ax / len : 0;
          const ny = ay !== 0 ? ay / len : 0;
          const heroSpd = Math.max(180, Math.min(440, cfg.heroSpeed || 310));

          pl.vx += nx * heroSpd * 8 * dt;
          pl.vy += ny * heroSpd * 8 * dt;
          const damping = Math.pow(0.015, dt);
          pl.vx *= damping;
          pl.vy *= damping;

          // Edge-triggered Shift Dash with invulnerability frames
          if ((sim.keys.has('ShiftLeft') || sim.keys.has('ShiftRight')) && pl.dashCd <= 0) {
            pl.vx = (nx || 0) * 680 + (nx === 0 && ny === 0 ? 0 : 0);
            pl.vy = (ny || -1) * 680;
            pl.dashCd = 1.1;
            pl.invuln = Math.max(pl.invuln, 0.24);
            spawnBurst(pl.x, pl.y, theme.heroColor, 8);
            playTone(340, 0.11, 'sawtooth', 0.06);
          }

          pl.x = Math.max(24, Math.min(ARENA_W - 24, pl.x + pl.vx * dt));
          pl.y = Math.max(24, Math.min(ARENA_H - 24, pl.y + pl.vy * dt));
          if (pl.invuln > 0) pl.invuln = Math.max(0, pl.invuln - dt);
          if (pl.dashCd > 0) pl.dashCd = Math.max(0, pl.dashCd - dt);
          if (pl.fireCd > 0) pl.fireCd = Math.max(0, pl.fireCd - dt);

          // Hero firing (Spacebar or Pointer Click)
          if ((sim.keys.has('Space') || sim.pointerDown) && pl.fireCd <= 0) {
            pl.fireCd = cfg.ability === 'nova_pulse' ? 0.26 : 0.16;
            const dx = sim.pointerDown ? pl.aimX - pl.x : 0;
            const dy = sim.pointerDown ? pl.aimY - pl.y : -1;
            const baseAngle = Math.atan2(dy, dx);

            if (cfg.ability === 'spread_shot') {
              [-0.22, 0, 0.22].forEach((offset) => {
                const a = baseAngle + offset;
                sim.bullets.push({
                  x: pl.x + Math.cos(a) * 14,
                  y: pl.y + Math.sin(a) * 14,
                  vx: Math.cos(a) * 580,
                  vy: Math.sin(a) * 580,
                  r: 4.5,
                  pierce: 1,
                });
              });
              playTone(640, 0.06, 'triangle', 0.05);
            } else if (cfg.ability === 'nova_pulse') {
              sim.bullets.push({
                x: pl.x + Math.cos(baseAngle) * 16,
                y: pl.y + Math.sin(baseAngle) * 16,
                vx: Math.cos(baseAngle) * 630,
                vy: Math.sin(baseAngle) * 630,
                r: 8,
                pierce: 3,
              });
              playTone(440, 0.09, 'sawtooth', 0.07);
            } else {
              const perpX = -Math.sin(baseAngle) * 7;
              const perpY = Math.cos(baseAngle) * 7;
              sim.bullets.push(
                {
                  x: pl.x + perpX,
                  y: pl.y + perpY,
                  vx: Math.cos(baseAngle) * 600,
                  vy: Math.sin(baseAngle) * 600,
                  r: 4,
                  pierce: 1,
                },
                {
                  x: pl.x - perpX,
                  y: pl.y - perpY,
                  vx: Math.cos(baseAngle) * 600,
                  vy: Math.sin(baseAngle) * 600,
                  r: 4,
                  pierce: 1,
                },
              );
              playTone(720, 0.05, 'triangle', 0.045);
            }
          }

          // Difficulty & wave spawn scaling (3 knobs: frequency, enemy speed, archetype mix)
          sim.spawnTimer -= dt;
          if (sim.spawnTimer <= 0 && sim.enemies.length < 18) {
            spawnEnemy(cfg, sim.wave);
            const diffInterval = cfg.difficulty === 'hardcore' ? 0.72 : cfg.difficulty === 'casual' ? 1.3 : 1.0;
            const baseInterval = Math.max(0.38, (1.85 - cfg.enemySpawnRate * 0.25 - sim.wave * 0.07) * diffInterval);
            sim.spawnTimer = baseInterval;
          }

          // Update bullets
          for (let i = sim.bullets.length - 1; i >= 0; i--) {
            const b = sim.bullets[i];
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            if (b.x < -30 || b.x > ARENA_W + 30 || b.y < -30 || b.y > ARENA_H + 30) {
              sim.bullets.splice(i, 1);
            }
          }

          // Check enemy bullets hitting hero
          for (let i = sim.bullets.length - 1; i >= 0; i--) {
            const b = sim.bullets[i];
            if (!b.fromEnemy) continue;
            if (pl.invuln <= 0 && Math.hypot(b.x - pl.x, b.y - pl.y) < 16 + b.r) {
              sim.bullets.splice(i, 1);
              pl.hp = Math.max(0, pl.hp - 1);
              pl.invuln = 1.05;
              sim.hitstop = 0.05;
              sim.trauma = 0.65;
              setHudShield(pl.hp);
              spawnBurst(pl.x, pl.y, '#FF4D6D', 20);
              playTone(140, 0.22, 'sawtooth', 0.11);
              if (pl.hp <= 0) {
                setEndSnapshot({
                  score: sim.score,
                  wave: sim.wave,
                  defeated: sim.defeated,
                });
                runStateRef.current = 'GAME_OVER';
                setRunState('GAME_OVER');
                break;
              }
            }
          }

          // Update energy cores (collectible drops)
          for (let i = sim.cores.length - 1; i >= 0; i--) {
            const c = sim.cores[i];
            c.life -= dt;
            if (Math.hypot(c.x - pl.x, c.y - pl.y) < 28) {
              sim.score += 50;
              setHudScore(sim.score);
              spawnBurst(c.x, c.y, theme.accent, 7);
              playTone(880, 0.07, 'sine', 0.06);
              sim.cores.splice(i, 1);
              if (sim.score >= cfg.winTargetScore) {
                setEndSnapshot({
                  score: sim.score,
                  wave: sim.wave,
                  defeated: sim.defeated,
                });
                runStateRef.current = 'VICTORY';
                setRunState('VICTORY');
                playTone(660, 0.25, 'triangle', 0.1);
                break;
              }
              continue;
            }
            if (c.life <= 0) sim.cores.splice(i, 1);
          }

          // Update enemies (3 distinct movement & windup policies + KO dissolve transition)
          for (let i = sim.enemies.length - 1; i >= 0; i--) {
            const e = sim.enemies[i];
            if (e.flashTimer > 0) e.flashTimer = Math.max(0, e.flashTimer - dt);

            if (e.koTimer > 0) {
              e.koTimer -= dt;
              e.x += e.vx * dt;
              e.y += e.vy * dt;
              if (e.koTimer <= 0) sim.enemies.splice(i, 1);
              continue;
            }

            const dx = pl.x - e.x;
            const dy = pl.y - e.y;
            const dist = Math.hypot(dx, dy) || 1;
            const diffSpeed = cfg.difficulty === 'hardcore' ? 1.25 : cfg.difficulty === 'casual' ? 0.82 : 1.0;

            if (e.kind === 'chaser') {
              // Archetype 1: Agile sinusoidal weave chaser
              const weave = Math.sin(sim.elapsed * 4 + i) * 42;
              const px = -dy / dist;
              const py = dx / dist;
              const spd = 122 * diffSpeed;
              e.vx = (dx / dist) * spd + px * weave;
              e.vy = (dy / dist) * spd + py * weave;
              e.x += e.vx * dt;
              e.y += e.vy * dt;
            } else if (e.kind === 'sniper') {
              // Archetype 2: Ranged orbiter with 0.55s laser telegraph windup
              if (e.windup > 0) {
                e.windup -= dt;
                if (e.windup <= 0) {
                  const adx = e.aimX - e.x;
                  const ady = e.aimY - e.y;
                  const alen = Math.hypot(adx, ady) || 1;
                  sim.bullets.push({
                    x: e.x,
                    y: e.y,
                    vx: (adx / alen) * 320,
                    vy: (ady / alen) * 320,
                    r: 5,
                    pierce: 1,
                    fromEnemy: true,
                  });
                  playTone(290, 0.08, 'square', 0.045);
                  e.phaseTimer = 2.1;
                }
              } else {
                const desiredDist = 230;
                const radial = dist > desiredDist + 20 ? 1 : dist < desiredDist - 25 ? -0.9 : 0;
                const orbitX = -dy / dist;
                const orbitY = dx / dist;
                const spd = 92 * diffSpeed;
                e.vx = (dx / dist) * spd * radial + orbitX * 68;
                e.vy = (dy / dist) * spd * radial + orbitY * 68;
                e.x += e.vx * dt;
                e.y += e.vy * dt;
                e.phaseTimer -= dt;
                if (e.phaseTimer <= 0 && dist < 440) {
                  e.windup = 0.55;
                  e.aimX = pl.x;
                  e.aimY = pl.y;
                }
              }
            } else if (e.kind === 'charger') {
              // Archetype 3: Armored bull charger with lock-on telegraph windup -> dash lunge
              if (e.windup > 0) {
                e.windup -= dt;
                if (e.windup <= 0) {
                  const cdx = e.aimX - e.x;
                  const cdy = e.aimY - e.y;
                  const clen = Math.hypot(cdx, cdy) || 1;
                  e.vx = (cdx / clen) * 410 * diffSpeed;
                  e.vy = (cdy / clen) * 410 * diffSpeed;
                  e.phaseTimer = 0.55; // lunge duration
                  playTone(210, 0.12, 'sawtooth', 0.06);
                }
              } else if (e.phaseTimer > 0 && Math.hypot(e.vx, e.vy) > 220) {
                e.x += e.vx * dt;
                e.y += e.vy * dt;
                e.phaseTimer -= dt;
                if (e.phaseTimer <= 0) {
                  e.vx = 0;
                  e.vy = 0;
                  e.phaseTimer = 1.1;
                }
              } else {
                const spd = 72 * diffSpeed;
                e.vx = (dx / dist) * spd;
                e.vy = (dy / dist) * spd;
                e.x += e.vx * dt;
                e.y += e.vy * dt;
                e.phaseTimer -= dt;
                if (e.phaseTimer <= 0 && dist < 340) {
                  e.windup = 0.48;
                  e.aimX = pl.x;
                  e.aimY = pl.y;
                }
              }
            }

            // Hero bullet hits enemy
            let destroyed = false;
            for (let j = sim.bullets.length - 1; j >= 0; j--) {
              const b = sim.bullets[j];
              if (b.fromEnemy) continue;
              const hitR = e.kind === 'charger' ? 20 : 15;
              if (Math.hypot(b.x - e.x, b.y - e.y) < hitR + b.r) {
                b.pierce -= 1;
                if (b.pierce <= 0) sim.bullets.splice(j, 1);
                e.hp -= 1;
                e.flashTimer = 0.06;
                spawnBurst(b.x, b.y, '#FFFFFF', 5);

                if (e.hp <= 0) {
                  e.koTimer = 0.25;
                  e.vx = (b.vx || 0) * 0.22;
                  e.vy = (b.vy || -100) * 0.22;
                  sim.score += e.kind === 'charger' ? 150 : 100;
                  sim.defeated += 1;
                  sim.wave = 1 + Math.floor(sim.score / 450);
                  sim.hitstop = e.kind === 'charger' ? 0.045 : 0.025;
                  sim.trauma = Math.min(1, sim.trauma + 0.28);
                  setHudScore(sim.score);
                  setHudWave(sim.wave);
                  spawnBurst(e.x, e.y, theme.accent, 18);
                  playTone(220, 0.12, 'square', 0.07);
                  if (Math.random() < 0.45) {
                    sim.cores.push({ x: e.x, y: e.y, life: 6.5 });
                  }
                  if (sim.score >= cfg.winTargetScore) {
                    setEndSnapshot({
                      score: sim.score,
                      wave: sim.wave,
                      defeated: sim.defeated,
                    });
                    runStateRef.current = 'VICTORY';
                    setRunState('VICTORY');
                    playTone(660, 0.26, 'triangle', 0.11);
                  }
                  destroyed = true;
                  break;
                } else {
                  playTone(390, 0.05, 'triangle', 0.04);
                }
              }
            }

            if (destroyed) continue;

            // Body collision vs Hero
            const collideR = e.kind === 'charger' ? 28 : 22;
            if (pl.invuln <= 0 && dist < collideR) {
              e.koTimer = 0.2;
              pl.hp = Math.max(0, pl.hp - 1);
              pl.invuln = 1.05;
              sim.hitstop = 0.05;
              sim.trauma = 0.72;
              setHudShield(pl.hp);
              spawnBurst(pl.x, pl.y, '#FF4D6D', 22);
              playTone(130, 0.22, 'sawtooth', 0.11);
              if (pl.hp <= 0) {
                setEndSnapshot({
                  score: sim.score,
                  wave: sim.wave,
                  defeated: sim.defeated,
                });
                runStateRef.current = 'GAME_OVER';
                setRunState('GAME_OVER');
                break;
              }
            }
          }
        }
      }

      // Render Arena on Canvas
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        const bgGrad = ctx.createLinearGradient(0, 0, 0, ARENA_H);
        bgGrad.addColorStop(0, theme.bgTop);
        bgGrad.addColorStop(1, theme.bgBottom);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, ARENA_W, ARENA_H);

        const shakeMag = sim.trauma * sim.trauma * 12;
        ctx.save();
        if (shakeMag > 0.2) {
          ctx.translate(
            (Math.random() - 0.5) * shakeMag,
            (Math.random() - 0.5) * shakeMag,
          );
        }

        // Perspective Arena Grid
        ctx.strokeStyle = theme.gridColor;
        ctx.lineWidth = 1;
        for (let x = 0; x <= ARENA_W; x += 48) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, ARENA_H);
          ctx.stroke();
        }
        for (let y = 0; y <= ARENA_H; y += 48) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(ARENA_W, y);
          ctx.stroke();
        }

        // Energy Core pickups
        for (const c of sim.cores) {
          ctx.fillStyle = theme.accent;
          ctx.beginPath();
          ctx.arc(c.x, c.y, 6 + Math.sin(sim.elapsed * 8) * 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Enemies + Telegraphs
        for (const e of sim.enemies) {
          if (e.windup > 0 && e.koTimer <= 0) {
            ctx.save();
            ctx.setLineDash([6, 5]);
            ctx.strokeStyle = e.kind === 'sniper' ? '#FF4D6D' : theme.accent;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(e.x, e.y);
            ctx.lineTo(e.aimX, e.aimY);
            ctx.stroke();
            ctx.restore();
          }

          ctx.save();
          ctx.translate(e.x, e.y);
          if (e.koTimer > 0) {
            ctx.globalAlpha = Math.max(0, e.koTimer / 0.25);
            const shrink = Math.max(0.2, e.koTimer / 0.25);
            ctx.scale(shrink, shrink);
          }

          const baseColor =
            e.flashTimer > 0
              ? '#FFFFFF'
              : e.kind === 'charger'
                ? theme.enemyCharger
                : e.kind === 'sniper'
                  ? theme.enemySniper
                  : theme.enemyChaser;
          ctx.fillStyle = baseColor;

          if (e.kind === 'charger') {
            ctx.beginPath();
            ctx.moveTo(0, -18);
            ctx.lineTo(18, 0);
            ctx.lineTo(0, 18);
            ctx.lineTo(-18, 0);
            ctx.closePath();
            ctx.fill();
          } else if (e.kind === 'sniper') {
            ctx.beginPath();
            for (let k = 0; k < 6; k++) {
              const ang = (Math.PI * 2 * k) / 6;
              const px = Math.cos(ang) * 14;
              const py = Math.sin(ang) * 14;
              if (k === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.moveTo(0, -13);
            ctx.lineTo(13, 11);
            ctx.lineTo(-13, 11);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }

        // Bullets
        for (const b of sim.bullets) {
          ctx.fillStyle = b.fromEnemy ? '#FF4D6D' : theme.accent;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          ctx.fill();
        }

        // Player Ship
        const pl = sim.player;
        if (runStateRef.current !== 'TITLE_MENU') {
          ctx.save();
          ctx.translate(pl.x, pl.y);
          if (pl.invuln > 0 && Math.floor(pl.invuln * 20) % 2 === 0) {
            ctx.globalAlpha = 0.45;
          }
          ctx.fillStyle = theme.heroColor;
          ctx.beginPath();
          ctx.moveTo(0, -18);
          ctx.lineTo(15, 13);
          ctx.lineTo(0, 6);
          ctx.lineTo(-15, 13);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
        }

        // Pooled Particles
        for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
          const p = sim.particles[i];
          if (!p.active) continue;
          ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      if (runStateRef.current === 'PLAYING' || sim.particles.some((p) => p.active)) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = 0;
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [playTone, spawnBurst, runState, config.theme]);

  const screenToWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: ARENA_W / 2, y: 120 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / Math.max(1, rect.width)) * ARENA_W,
      y: ((clientY - rect.top) / Math.max(1, rect.height)) * ARENA_H,
    };
  };

  const themeSpec = GAME_THEMES[config.theme] || GAME_THEMES.orbital_gold;
  const abilitySpec =
    HERO_ABILITIES.find((a) => a.id === config.ability) || HERO_ABILITIES[0];
  const titleSafe = normalizeGameTitle(config.title);

  return (
    <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-white/15 bg-[#060E1B] select-none shadow-2xl">
      <canvas
        ref={canvasRef}
        width={ARENA_W}
        height={ARENA_H}
        onPointerMove={(e) => {
          const pt = screenToWorld(e.clientX, e.clientY);
          simRef.current.player.aimX = pt.x;
          simRef.current.player.aimY = pt.y;
        }}
        onPointerDown={(e) => {
          if (runStateRef.current !== 'PLAYING') return;
          const pt = screenToWorld(e.clientX, e.clientY);
          simRef.current.player.aimX = pt.x;
          simRef.current.player.aimY = pt.y;
          simRef.current.pointerDown = true;
        }}
        onPointerUp={() => {
          simRef.current.pointerDown = false;
        }}
        onPointerLeave={() => {
          simRef.current.pointerDown = false;
        }}
        className="block w-full h-full cursor-crosshair"
      />

      {/* Active Gameplay Perimeter HUD (<= 15% area, zero backdrop-blur) */}
      {runState !== 'TITLE_MENU' && (
        <div className="absolute inset-x-0 top-0 pointer-events-none flex items-start justify-between p-3 sm:p-4">
          {/* Top-Left Telemetry Cluster */}
          <div className="bg-[#060E1B]/85 border border-white/15 rounded-xl px-3 py-2 flex items-center gap-4">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                SCORE / TARGET
              </div>
              <div className="font-mono text-base sm:text-lg font-bold text-[#F5C542] tabular-nums leading-tight">
                {Math.round(hudScore)}{' '}
                <span className="text-xs text-slate-400">/ {config.winTargetScore}</span>
              </div>
            </div>
            <div className="h-6 w-px bg-white/15" />
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                WAVE
              </div>
              <div className="font-mono text-base sm:text-lg font-bold text-white tabular-nums leading-tight">
                {hudWave}
              </div>
            </div>
          </div>

          {/* Top-Right Shield Pips + Utility Controls */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <div className="bg-[#060E1B]/85 border border-white/15 rounded-xl px-3 py-2 flex items-center gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mr-1">
                SHIELD
              </span>
              {[0, 1, 2].map((idx) => (
                <svg
                  key={idx}
                  viewBox="0 0 24 24"
                  className="w-4 h-4"
                  aria-label={idx < hudShield ? 'Active Shield' : 'Empty Shield Socket'}
                >
                  <path
                    d="M12 2L4 5v6c0 5.25 3.4 10.15 8 11.4 4.6-1.25 8-6.15 8-11.4V5l-8-3z"
                    fill={idx < hudShield ? themeSpec.accent : 'rgba(255,255,255,0.12)'}
                    stroke="#060E1B"
                    strokeWidth="1.5"
                  />
                </svg>
              ))}
            </div>

            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                setMuted((m) => !m);
              }}
              title="Toggle Mute [M]"
              aria-label="Toggle Mute"
              className="w-9 h-9 rounded-xl bg-[#060E1B]/85 border border-white/15 hover:border-[#F5C542] text-white flex items-center justify-center"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
                {muted ? (
                  <line x1="22" y1="9" x2="16" y2="15" />
                ) : (
                  <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                )}
              </svg>
            </button>

            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                const next: ArcadeRunState = runState === 'PLAYING' ? 'PAUSED' : 'PLAYING';
                runStateRef.current = next;
                setRunState(next);
              }}
              title="Pause Game [P]"
              aria-label="Pause Game"
              className="w-9 h-9 rounded-xl bg-[#060E1B]/85 border border-white/15 hover:border-[#F5C542] text-white flex items-center justify-center"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            </button>

            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                startGame();
              }}
              title="Restart Run [R]"
              aria-label="Restart Run"
              className="w-9 h-9 rounded-xl bg-[#060E1B]/85 border border-white/15 hover:border-[#F5C542] text-white flex items-center justify-center"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* TITLE SCREEN OVERLAY (Illustrated Key-Art + Inline SVG Crest + [data-start="true"]) */}
      {runState === 'TITLE_MENU' && (
        <div className="absolute inset-0 flex flex-col justify-between p-6 sm:p-8 bg-[#060E1B]">
          <img
            src={gameBackdropImg}
            alt="Orbital Arena Backdrop"
            className="absolute inset-0 w-full h-full object-cover opacity-50 pointer-events-none"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#050C18]/90 via-[#050C18]/65 to-transparent pointer-events-none" />

          {/* Upper Left Negative-Space Lockup */}
          <div className="relative z-10 max-w-lg space-y-3 mt-2 sm:mt-4">
            <svg viewBox="0 0 120 34" className="w-28 h-8" aria-hidden="true">
              <polygon
                points="14,2 26,9 26,23 14,30 2,23 2,9"
                fill="none"
                stroke={themeSpec.accent}
                strokeWidth="2.5"
              />
              <polygon points="14,7 21,16 14,25 7,16" fill={themeSpec.accent} />
              <line x1="34" y1="16" x2="112" y2="16" stroke={themeSpec.accent} strokeWidth="1.5" strokeOpacity="0.6" />
            </svg>

            <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-wide text-white">
              {titleSafe}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {config.subtitle || 'Custom PRIME X Arcade Build'} · {abilitySpec.label} · {themeSpec.label}
            </p>

            <div className="pt-2">
              <button
                type="button"
                data-start="true"
                onClick={startGame}
                className="px-7 py-3 rounded-xl bg-[#F5C542] hover:bg-[#D4AF37] text-[#08172C] font-display font-extrabold text-sm tracking-wider shadow-lg transition-colors"
              >
                START MISSION
              </button>
            </div>
          </div>

          {/* Single Flat Borderless Control-Hint Line */}
          <div className="relative z-10 text-[11px] font-mono text-slate-300 tracking-wide">
            WASD / Arrows Move · Space / Click Fire · Shift Dash · P Pause · M Mute
          </div>
        </div>
      )}

      {/* PAUSED MODAL (No backdrop-blur over live canvas) */}
      {runState === 'PAUSED' && (
        <div className="absolute inset-0 bg-[#050C18]/85 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#F5C542]/40 bg-[#0B1B34] p-6 text-center space-y-4 shadow-2xl">
            <h3 className="font-display text-2xl font-bold text-[#F5C542]">PAUSED</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-[#071222] p-2.5">
                <div className="text-slate-400">SCORE</div>
                <div className="font-mono text-base font-bold text-white tabular-nums">
                  {hudScore}
                </div>
              </div>
              <div className="rounded-xl bg-[#071222] p-2.5">
                <div className="text-slate-400">WAVE</div>
                <div className="font-mono text-base font-bold text-white tabular-nums">
                  {hudWave}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  runStateRef.current = 'PLAYING';
                  setRunState('PLAYING');
                }}
                className="w-full py-2.5 rounded-xl bg-[#F5C542] text-[#08172C] font-bold text-sm"
              >
                Resume Mission
              </button>
              <button
                type="button"
                onClick={startGame}
                className="w-full py-2 rounded-xl border border-white/20 text-white text-xs font-semibold hover:bg-white/10"
              >
                Restart Run
              </button>
              <button
                type="button"
                onClick={() => {
                  resetWorld();
                  runStateRef.current = 'TITLE_MENU';
                  setRunState('TITLE_MENU');
                }}
                className="w-full py-2 rounded-xl text-slate-300 text-xs hover:text-white"
              >
                Return to Title
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VICTORY / GAME OVER MODAL */}
      {(runState === 'VICTORY' || runState === 'GAME_OVER') && (
        <div className="absolute inset-0 bg-[#050C18]/85 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#F5C542]/45 bg-[#0B1B34] p-6 text-center space-y-4 shadow-2xl">
            <h3
              className={`font-display text-2xl font-extrabold ${
                runState === 'VICTORY' ? 'text-[#F5C542]' : 'text-rose-400'
              }`}
            >
              {runState === 'VICTORY' ? 'MISSION VICTORY' : 'SHIELD DEPLETED'}
            </h3>
            <p className="text-xs text-slate-300">
              {runState === 'VICTORY'
                ? `Target score ${config.winTargetScore} reached!`
                : 'Regroup and launch another sortie.'}
            </p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl bg-[#071222] p-2.5">
                <div className="text-[10px] text-slate-400">SCORE</div>
                <div className="font-mono text-sm font-bold text-[#F5C542] tabular-nums">
                  {endSnapshot.score}
                </div>
              </div>
              <div className="rounded-xl bg-[#071222] p-2.5">
                <div className="text-[10px] text-slate-400">WAVE</div>
                <div className="font-mono text-sm font-bold text-white tabular-nums">
                  {endSnapshot.wave}
                </div>
              </div>
              <div className="rounded-xl bg-[#071222] p-2.5">
                <div className="text-[10px] text-slate-400">DEFEATED</div>
                <div className="font-mono text-sm font-bold text-white tabular-nums">
                  {endSnapshot.defeated}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                data-start="true"
                onClick={startGame}
                className="flex-1 py-2.5 rounded-xl bg-[#F5C542] hover:bg-[#D4AF37] text-[#08172C] font-display font-bold text-sm"
              >
                Play Again
              </button>
              <button
                type="button"
                onClick={() => {
                  resetWorld();
                  runStateRef.current = 'TITLE_MENU';
                  setRunState('TITLE_MENU');
                }}
                className="px-4 py-2.5 rounded-xl border border-white/20 text-slate-200 text-xs font-semibold hover:bg-white/10"
              >
                Title
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
