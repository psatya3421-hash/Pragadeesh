import type { GameProject, GameThemeId, HeroAbilityId, Order } from '../types';

export const GAME_DOWNLOAD_FEE_INR = 10;

export interface GameThemeSpec {
  id: GameThemeId;
  label: string;
  bgTop: string;
  bgBottom: string;
  accent: string;
  heroColor: string;
  enemyChaser: string;
  enemySniper: string;
  enemyCharger: string;
  gridColor: string;
}

export const GAME_THEMES: Record<GameThemeId, GameThemeSpec> = {
  orbital_gold: {
    id: 'orbital_gold',
    label: 'Orbital Gold Citadel',
    bgTop: '#071324',
    bgBottom: '#0E2444',
    accent: '#F5C542',
    heroColor: '#56E0FF',
    enemyChaser: '#FFB703',
    enemySniper: '#38D996',
    enemyCharger: '#FF4D6D',
    gridColor: 'rgba(245, 197, 66, 0.08)',
  },
  neon_cyber: {
    id: 'neon_cyber',
    label: 'Neon Trench Grid',
    bgTop: '#08071A',
    bgBottom: '#16113A',
    accent: '#00F5D4',
    heroColor: '#F5C542',
    enemyChaser: '#FF5E7E',
    enemySniper: '#9B5DE5',
    enemyCharger: '#FF9E00',
    gridColor: 'rgba(0, 245, 212, 0.09)',
  },
  deep_sea: {
    id: 'deep_sea',
    label: 'Abyssal Bio-Reef',
    bgTop: '#03151E',
    bgBottom: '#072D3E',
    accent: '#4CC9F0',
    heroColor: '#F5C542',
    enemyChaser: '#FF7B54',
    enemySniper: '#72EFDD',
    enemyCharger: '#F72585',
    gridColor: 'rgba(76, 201, 240, 0.08)',
  },
  crimson_forge: {
    id: 'crimson_forge',
    label: 'Obsidian Vulcan Forge',
    bgTop: '#16090D',
    bgBottom: '#2B1117',
    accent: '#FF9F1C',
    heroColor: '#70E0FF',
    enemyChaser: '#FFBF69',
    enemySniper: '#80ED99',
    enemyCharger: '#FF3355',
    gridColor: 'rgba(255, 159, 28, 0.08)',
  },
};

export const HERO_ABILITIES: {
  id: HeroAbilityId;
  label: string;
  description: string;
}[] = [
  {
    id: 'twin_laser',
    label: 'Twin Plasma Bolts',
    description: 'Fast parallel beams with balanced energy velocity.',
  },
  {
    id: 'spread_shot',
    label: 'Tri-Arc Spread Cannon',
    description: 'Three-way fan burst ideal for clearing swarms.',
  },
  {
    id: 'nova_pulse',
    label: 'Gold Nova Shockwave',
    description: 'High-impact kinetic ring & piercing core lance.',
  },
];

export function createDefaultGameConfig(): Omit<
  GameProject,
  'id' | 'userId' | 'createdAt' | 'updatedAt'
> {
  return {
    title: 'STARFALL CITADEL',
    subtitle: 'Defend the Golden Orbital Ring',
    theme: 'orbital_gold',
    ability: 'twin_laser',
    heroSpeed: 310,
    enemySpawnRate: 3,
    difficulty: 'arcade',
    winTargetScore: 1500,
    soundEnabled: true,
  };
}

export function normalizeGameTitle(title: string): string {
  const clean = (title || '').trim();
  return clean ? clean.slice(0, 48) : 'PRIME X ARCADE';
}

export function sanitizeSlug(title: string): string {
  return (
    normalizeGameTitle(title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'primex-game'
  );
}

/**
 * Checks if a user has a Verified/Completed ₹10 download order for a given game.
 */
export function hasUnlockedGameDownload(orders: Order[], gameId?: string): boolean {
  return orders.some((o) => {
    if (o.type !== 'game_download') return false;
    if (o.status !== 'Verified' && o.status !== 'Completed') return false;
    if (!gameId) return true;
    return o.gameId === gameId || o.items.some((item) => item.productId === gameId);
  });
}

export function findPendingGameDownloadOrder(
  orders: Order[],
  gameId?: string,
): Order | null {
  const match = orders.find((o) => {
    if (o.type !== 'game_download') return false;
    if (o.status === 'Rejected' || o.status === 'Verified' || o.status === 'Completed') {
      return false;
    }
    if (!gameId) return true;
    return o.gameId === gameId || o.items.some((item) => item.productId === gameId);
  });
  return match || null;
}

/**
 * Generates a self-contained single-file HTML5 playable game bundle reflecting the user's created config.
 */
export function buildStandaloneHtmlGame(
  config: Pick<
    GameProject,
    'title' | 'subtitle' | 'theme' | 'ability' | 'heroSpeed' | 'enemySpawnRate' | 'difficulty' | 'winTargetScore'
  >,
): string {
  const theme = GAME_THEMES[config.theme] || GAME_THEMES.orbital_gold;
  const titleSafe = normalizeGameTitle(config.title).replace(/[<>&"']/g, '');
  const subSafe = (config.subtitle || 'Built with PRIME X GAME STUDIO')
    .trim()
    .slice(0, 80)
    .replace(/[<>&"']/g, '');

  const serializedConfig = JSON.stringify({
    title: titleSafe,
    subtitle: subSafe,
    theme,
    ability: config.ability,
    heroSpeed: Math.max(180, Math.min(440, Number(config.heroSpeed || 310))),
    enemySpawnRate: Math.max(1, Math.min(5, Number(config.enemySpawnRate || 3))),
    difficulty: config.difficulty,
    winTargetScore: Math.max(500, Math.min(10000, Number(config.winTargetScore || 1500))),
  });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${titleSafe} — PRIME X GAME STUDIO</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: ${theme.bgTop};
      color: #f8fafc;
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      overflow: hidden;
    }
    .shell {
      width: min(960px, 96vw);
      border: 1px solid rgba(255,255,255,0.16);
      border-radius: 16px;
      overflow: hidden;
      background: ${theme.bgBottom};
      box-shadow: 0 24px 60px rgba(0,0,0,0.6);
    }
    .hud {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 18px;
      background: rgba(5,12,24,0.85);
      border-bottom: 1px solid rgba(255,255,255,0.12);
      font-size: 13px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .hud strong { color: ${theme.accent}; }
    .stage { position: relative; aspect-ratio: 16/9; background: ${theme.bgTop}; }
    canvas { display: block; width: 100%; height: 100%; }
    .overlay {
      position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 14px; text-align: center;
      background: rgba(5, 11, 22, 0.82); backdrop-filter: blur(6px); padding: 24px;
    }
    .hidden { display: none !important; }
    h1 { margin: 0; font-size: clamp(28px, 4vw, 44px); color: ${theme.accent}; letter-spacing: 0.04em; }
    p { margin: 0; color: #cbd5e1; font-size: 14px; max-width: 520px; }
    button {
      border: 0; border-radius: 10px; padding: 12px 26px; font-weight: 800; font-size: 14px;
      background: ${theme.accent}; color: #081224; cursor: pointer;
    }
    button:hover { filter: brightness(1.08); }
  </style>
</head>
<body data-state="TITLE_MENU">
  <div class="shell">
    <div class="hud">
      <div>${titleSafe}</div>
      <div>SCORE: <strong id="hud-score">0</strong> / ${config.winTargetScore}</div>
      <div>SHIELD: <strong id="hud-hp">3</strong> · WAVE: <strong id="hud-wave">1</strong></div>
    </div>
    <div class="stage">
      <canvas id="gameCanvas" width="960" height="540"></canvas>
      <div id="titleOverlay" class="overlay">
        <h1>${titleSafe}</h1>
        <p>${subSafe}</p>
        <p>WASD / Arrows Move · Space Fire · Shift Dash · P Pause</p>
        <button id="startBtn" data-start="true">START MISSION</button>
      </div>
      <div id="endOverlay" class="overlay hidden">
        <h1 id="endTitle">MISSION COMPLETE</h1>
        <p id="endStats">Final Score: 0</p>
        <button id="restartBtn">PLAY AGAIN</button>
      </div>
    </div>
  </div>
  <script>
    (function () {
      const CFG = ${serializedConfig};
      const canvas = document.getElementById('gameCanvas');
      const ctx = canvas.getContext('2d');
      const titleEl = document.getElementById('titleOverlay');
      const endEl = document.getElementById('endOverlay');
      const hudScore = document.getElementById('hud-score');
      const hudHp = document.getElementById('hud-hp');
      const hudWave = document.getElementById('hud-wave');
      let state = 'TITLE_MENU';
      let keys = {};
      let player, bullets, enemies, particles, score, wave, spawnTimer, fireCd, lastTs;

      function initGame() {
        player = { x: 480, y: 270, vx: 0, vy: 0, hp: 3, invuln: 0, dashCd: 0 };
        bullets = []; enemies = []; particles = [];
        score = 0; wave = 1; spawnTimer = 0.6; fireCd = 0;
        hudScore.textContent = '0'; hudHp.textContent = '3'; hudWave.textContent = '1';
      }

      function setState(next) {
        state = next;
        document.body.dataset.state = next;
        titleEl.classList.toggle('hidden', next !== 'TITLE_MENU');
        endEl.classList.toggle('hidden', next !== 'GAME_OVER' && next !== 'VICTORY');
      }

      function spawnBurst(x, y, color) {
        for (let i = 0; i < 12; i++) {
          const ang = (Math.PI * 2 * i) / 12;
          const spd = 70 + Math.random() * 140;
          particles.push({ x, y, vx: Math.cos(ang)*spd, vy: Math.sin(ang)*spd, life: 0.4, color });
        }
      }

      function spawnEnemy() {
        const edge = Math.floor(Math.random() * 4);
        let x = edge === 0 ? 0 : edge === 1 ? 960 : Math.random() * 960;
        let y = edge === 2 ? 0 : edge === 3 ? 540 : Math.random() * 540;
        const kinds = ['chaser', 'sniper', 'charger'];
        const kind = kinds[Math.floor(Math.random() * kinds.length)];
        enemies.push({ x, y, vx: 0, vy: 0, kind, hp: kind === 'charger' ? 2 : 1, timer: 1.0 });
      }

      function step(dt) {
        if (state !== 'PLAYING') return;
        const ax = (keys['ArrowRight'] || keys['KeyD'] ? 1 : 0) - (keys['ArrowLeft'] || keys['KeyA'] ? 1 : 0);
        const ay = (keys['ArrowDown'] || keys['KeyS'] ? 1 : 0) - (keys['ArrowUp'] || keys['KeyW'] ? 1 : 0);
        player.vx += ax * CFG.heroSpeed * 5 * dt;
        player.vy += ay * CFG.heroSpeed * 5 * dt;
        player.vx *= Math.pow(0.06, dt);
        player.vy *= Math.pow(0.06, dt);
        if ((keys['ShiftLeft'] || keys['ShiftRight']) && player.dashCd <= 0) {
          player.vx += (ax || 1) * 520; player.vy += ay * 520;
          player.dashCd = 1.2; player.invuln = 0.25;
        }
        player.x = Math.max(22, Math.min(938, player.x + player.vx * dt));
        player.y = Math.max(22, Math.min(518, player.y + player.vy * dt));
        if (player.invuln > 0) player.invuln -= dt;
        if (player.dashCd > 0) player.dashCd -= dt;
        if (fireCd > 0) fireCd -= dt;

        if (keys['Space'] && fireCd <= 0) {
          fireCd = 0.18;
          if (CFG.ability === 'spread_shot') {
            [-0.22, 0, 0.22].forEach((a) => bullets.push({ x: player.x, y: player.y - 12, vx: Math.sin(a)*540, vy: -Math.cos(a)*540, r: 4 }));
          } else if (CFG.ability === 'nova_pulse') {
            bullets.push({ x: player.x, y: player.y - 14, vx: 0, vy: -600, r: 7 });
          } else {
            bullets.push({ x: player.x - 8, y: player.y - 10, vx: 0, vy: -560, r: 4 });
            bullets.push({ x: player.x + 8, y: player.y - 10, vx: 0, vy: -560, r: 4 });
          }
        }

        spawnTimer -= dt;
        if (spawnTimer <= 0) {
          spawnEnemy();
          spawnTimer = Math.max(0.4, (2.2 - CFG.enemySpawnRate * 0.28) - wave * 0.06);
        }

        bullets = bullets.filter((b) => { b.x += b.vx * dt; b.y += b.vy * dt; return b.y > -20 && b.y < 560 && b.x > -20 && b.x < 980; });
        particles = particles.filter((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; return p.life > 0; });

        for (let i = enemies.length - 1; i >= 0; i--) {
          const e = enemies[i];
          const dx = player.x - e.x, dy = player.y - e.y;
          const dist = Math.hypot(dx, dy) || 1;
          const spd = e.kind === 'charger' ? 145 : e.kind === 'sniper' ? 95 : 120;
          e.x += (dx / dist) * spd * dt;
          e.y += (dy / dist) * spd * dt;

          for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            if (Math.hypot(b.x - e.x, b.y - e.y) < 18 + b.r) {
              bullets.splice(j, 1);
              e.hp -= 1;
              if (e.hp <= 0) {
                score += 100;
                wave = 1 + Math.floor(score / 500);
                hudScore.textContent = String(score);
                hudWave.textContent = String(wave);
                spawnBurst(e.x, e.y, CFG.theme.accent);
                enemies.splice(i, 1);
                if (score >= CFG.winTargetScore) {
                  document.getElementById('endTitle').textContent = 'VICTORY!';
                  document.getElementById('endStats').textContent = 'Target Reached · Final Score: ' + score;
                  setState('VICTORY');
                }
              }
              break;
            }
          }

          if (enemies[i] && player.invuln <= 0 && dist < 24) {
            enemies.splice(i, 1);
            player.hp -= 1;
            player.invuln = 1.0;
            hudHp.textContent = String(Math.max(0, player.hp));
            spawnBurst(player.x, player.y, '#FF4D6D');
            if (player.hp <= 0) {
              document.getElementById('endTitle').textContent = 'GAME OVER';
              document.getElementById('endStats').textContent = 'Final Score: ' + score + ' · Wave ' + wave;
              setState('GAME_OVER');
            }
          }
        }
      }

      function render() {
        const g = ctx.createLinearGradient(0, 0, 0, 540);
        g.addColorStop(0, CFG.theme.bgTop);
        g.addColorStop(1, CFG.theme.bgBottom);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 960, 540);

        ctx.strokeStyle = CFG.theme.gridColor;
        ctx.lineWidth = 1;
        for (let x = 0; x < 960; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 540); ctx.stroke(); }
        for (let y = 0; y < 540; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(960, y); ctx.stroke(); }

        if (state === 'PLAYING' || state === 'PAUSED') {
          ctx.fillStyle = CFG.theme.heroColor;
          ctx.beginPath();
          ctx.moveTo(player.x, player.y - 16);
          ctx.lineTo(player.x + 14, player.y + 12);
          ctx.lineTo(player.x, player.y + 6);
          ctx.lineTo(player.x - 14, player.y + 12);
          ctx.closePath();
          ctx.fill();

          bullets.forEach((b) => {
            ctx.fillStyle = CFG.theme.accent;
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
          });

          enemies.forEach((e) => {
            ctx.fillStyle = e.kind === 'charger' ? CFG.theme.enemyCharger : e.kind === 'sniper' ? CFG.theme.enemySniper : CFG.theme.enemyChaser;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.kind === 'charger' ? 16 : 12, 0, Math.PI * 2);
            ctx.fill();
          });

          particles.forEach((p) => {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.max(0, p.life * 2);
            ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
            ctx.globalAlpha = 1;
          });
        }
      }

      function loop(ts) {
        const dt = Math.min(0.05, lastTs ? (ts - lastTs) / 1000 : 0.016);
        lastTs = ts;
        step(dt);
        render();
        requestAnimationFrame(loop);
      }

      window.addEventListener('keydown', (e) => {
        keys[e.code] = true;
        if (e.code === 'KeyP' && (state === 'PLAYING' || state === 'PAUSED')) {
          setState(state === 'PLAYING' ? 'PAUSED' : 'PLAYING');
        }
      });
      window.addEventListener('keyup', (e) => { keys[e.code] = false; });
      document.getElementById('startBtn').addEventListener('click', () => { initGame(); setState('PLAYING'); });
      document.getElementById('restartBtn').addEventListener('click', () => { initGame(); setState('PLAYING'); });
      initGame();
      requestAnimationFrame(loop);
    })();
  </script>
</body>
</html>`;
}
