// --- SISTEMA DE ÁUDIO SINTETIZADO ---
class SoundEffects {
  constructor() {
    this.ctx = null;
  }
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }
  playPunch() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(20, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }
  playKick() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(80, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }
  playSuper() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(600, this.ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.4);
  }
  playBlock() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, this.ctx.currentTime);
    osc.frequency.setValueAtTime(150, this.ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }
  playGuardBreak() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(80, this.ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.4);
  }
}
const sfx = new SoundEffects();

// --- DEFINIÇÃO DOS PERSONAGENS ---
const CHARACTERS = {
  ze: {
    name: "Zé Porrada",
    maxHp: 100,
    speed: 5,
    jumpForce: 13,
    color: "#00f0ff",
    secondaryColor: "#ff0055",
    type: "ze"
  },
  ninja: {
    name: "Ninja ZL",
    maxHp: 85,
    speed: 7,
    jumpForce: 14,
    color: "#a000ff",
    secondaryColor: "#00ffff",
    type: "ninja"
  },
  tonho: {
    name: "Tonho Bruto",
    maxHp: 130,
    speed: 3.8,
    jumpForce: 11.5,
    color: "#ffaa00",
    secondaryColor: "#ff0000",
    type: "tonho"
  }
};

// --- TELA CHEIA (FULLSCREEN) ---
function toggleFullscreen() {
  const container = document.getElementById('game-container');
  if (!document.fullscreenElement && !document.mozFullScreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
    if (container.requestFullscreen) {
      container.requestFullscreen();
    } else if (container.msRequestFullscreen) {
      container.msRequestFullscreen();
    } else if (container.mozRequestFullScreen) {
      container.mozRequestFullScreen();
    } else if (container.webkitRequestFullscreen) {
      container.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }
}

document.addEventListener('fullscreenchange', updateFullscreenBtn);
document.addEventListener('webkitfullscreenchange', updateFullscreenBtn);
document.addEventListener('mozfullscreenchange', updateFullscreenBtn);
document.addEventListener('MSFullscreenChange', updateFullscreenBtn);

function updateFullscreenBtn() {
  const btn = document.getElementById('fullscreen-btn');
  if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement) {
    btn.innerText = "SAIR TELA CHEIA";
  } else {
    btn.innerText = "TELA CHEIA";
  }
}

// --- CLASSE LUTADOR ---
class Fighter {
  constructor(x, y, facingRight, config, controls) {
    this.startX = x;
    this.startY = y;
    this.x = x;
    this.y = y;
    this.width = 60;
    this.height = 110;
    this.facingRight = facingRight;
    this.config = config;
    this.controls = controls;

    this.vx = 0;
    this.vy = 0;
    this.isGrounded = false;
    this.isCrouching = false;
    this.isGuarding = false;

    // Barra de Defesa
    this.guardStamina = 100;
    this.maxGuardStamina = 100;
    this.isGuardBroken = false;
    this.guardBreakTimer = 0;

    this.hp = config.maxHp;
    this.maxHp = config.maxHp;
    this.superMeter = 0;

    this.animState = 'idle';
    this.animFrame = 0;
    this.animTimer = 0;

    this.isAttacking = false;
    this.attackType = null;
    this.attackBox = { x: 0, y: 0, width: 0, height: 0 };
    this.attackTimer = 0;
    this.attackHasHit = false;

    this.hitStun = 0;
    this.wins = 0;
    this.jumpsLeft = config.type === 'ninja' ? 2 : 1;
    this.trail = [];
  }

  reset(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.hp = this.maxHp;
    this.superMeter = 0;
    this.guardStamina = this.maxGuardStamina;
    this.isGuardBroken = false;
    this.guardBreakTimer = 0;
    this.isAttacking = false;
    this.hitStun = 0;
    this.animState = 'idle';
  }

  update(keys, opponent, groundY, particles) {
    this.animTimer++;

    // Rastro de movimento
    if (Math.abs(this.vx) > 3 || this.isAttacking) {
      this.trail.push({ x: this.x, y: this.y, facingRight: this.facingRight, state: this.animState, alpha: 0.5 });
      if (this.trail.length > 5) this.trail.shift();
    } else {
      if (this.trail.length > 0) this.trail.shift();
    }
    this.trail.forEach(t => t.alpha -= 0.08);

    // Recuperação de Guard Break
    if (this.isGuardBroken) {
      this.guardBreakTimer--;
      this.isGuarding = false;
      this.isCrouching = false;
      if (this.guardBreakTimer <= 0) {
        this.isGuardBroken = false;
        this.guardStamina = this.maxGuardStamina;
      }
    }

    if (this.hitStun > 0) {
      this.hitStun--;
      return;
    }

    // Gerenciamento da Defesa
    const downPressed = keys[this.controls.down];
    if (downPressed && !this.isGuardBroken && this.isGrounded && !this.isAttacking) {
      this.isCrouching = true;
      this.isGuarding = true;
      this.guardStamina -= 0.25; 
      if (this.guardStamina <= 0) {
        this.triggerGuardBreak(particles);
      }
    } else {
      this.isCrouching = false;
      this.isGuarding = false;
      if (!this.isGuardBroken && this.guardStamina < this.maxGuardStamina) {
        this.guardStamina += 0.35;
        if (this.guardStamina > this.maxGuardStamina) this.guardStamina = this.maxGuardStamina;
      }
    }

    // Orientação do personagem
    if (!this.isAttacking && this.hitStun === 0) {
      this.facingRight = (this.x + this.width / 2) < (opponent.x + opponent.width / 2);
    }

    // Movimentação Horizontal
    if (!this.isCrouching && !this.isAttacking && !this.isGuardBroken) {
      if (keys[this.controls.left]) {
        this.vx = -this.config.speed;
      } else if (keys[this.controls.right]) {
        this.vx = this.config.speed;
      } else {
        this.vx = 0;
      }
    } else {
      this.vx = 0;
    }

    // Gravidade e Pulo
    this.vy += 0.7; // Gravidade
    this.x += this.vx;
    this.y += this.vy;

    if (this.y + this.height >= groundY) {
      this.y = groundY - this.height;
      this.vy = 0;
      this.isGrounded = true;
      this.jumpsLeft = this.config.type === 'ninja' ? 2 : 1;
    } else {
      this.isGrounded = false;
    }

    // Limites de Tela
    if (this.x < 20) this.x = 20;
    if (this.x + this.width > 1004) this.x = 1004 - this.width;

    // Atualização de Ataques
    if (this.isAttacking) {
      this.attackTimer--;
      if (this.attackTimer <= 0) {
        this.isAttacking = false;
        this.attackType = null;
      }
    }
  }

  triggerGuardBreak(particles) {
    this.isGuardBroken = true;
    this.guardBreakTimer = 90;
    this.guardStamina = 0;
    this.isGuarding = false;
    this.isCrouching = false;
    this.isAttacking = false;
    sfx.playGuardBreak();

    for (let i = 0; i < 20; i++) {
      particles.push({
        x: this.x + this.width / 2,
        y: this.y + 30,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        color: '#00ffff',
        size: Math.random() * 6 + 2,
        life: 25
      });
    }
  }

  jump() {
    if (this.isGuardBroken) return;
    if (this.jumpsLeft > 0 && !this.isCrouching && !this.isAttacking) {
      this.vy = -this.config.jumpForce;
      this.jumpsLeft--;
      this.isGrounded = false;
    }
  }

  attack(type) {
    if (this.isAttacking || this.hitStun > 0 || this.isCrouching || this.isGuardBroken) return;

    if (type === 'super' && this.superMeter < 100) {
      type = 'heavy';
    }

    this.isAttacking = true;
    this.attackType = type;
    this.attackHasHit = false;

    if (type === 'light') {
      this.attackTimer = 12;
      sfx.playPunch();
    } else if (type === 'heavy') {
      this.attackTimer = 20;
      sfx.playKick();
    } else if (type === 'kick') {
      this.attackTimer = 18;
      sfx.playKick();
    } else if (type === 'super') {
      this.superMeter = 0;
      this.attackTimer = 30;
      sfx.playSuper();
    }
  }

  getAttackBox() {
    let range = 50;
    let height = 30;
    let offsetY = 20;

    if (this.attackType === 'heavy') { range = 70; height = 40; }
    if (this.attackType === 'kick') { range = 65; offsetY = 50; }
    if (this.attackType === 'super') { range = 110; height = 70; offsetY = 10; }

    const x = this.facingRight ? this.x + this.width : this.x - range;
    return { x, y: this.y + offsetY, width: range, height };
  }

  takeDamage(amount, isBlockable = true, particles) {
    if (this.isGuarding && isBlockable) {
      const blockedAmount = amount * 0.2;
      this.hp -= blockedAmount;
      this.guardStamina -= amount * 0.8;
      sfx.playBlock();

      if (this.guardStamina <= 0) {
        this.triggerGuardBreak(particles);
      }
      return true;
    } else {
      this.hp -= amount;
      this.hitStun = 12;
      this.isAttacking = false;
      this.superMeter = Math.min(100, this.superMeter + amount * 0.8);
      return false;
    }
  }

  draw(ctx) {
    // Desenhar Rastro (Motion Trail)
    this.trail.forEach(t => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, t.alpha * 0.4);
      ctx.fillStyle = this.config.color;
      ctx.fillRect(t.x, t.y, this.width, this.height);
      ctx.restore();
    });

    ctx.save();

    // Sombra do Personagem
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(this.x + this.width / 2, 490, 35, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Feedback visual de Dano/Stun
    if (this.hitStun > 0) {
      ctx.translate((Math.random() - 0.5) * 6, 0);
      ctx.filter = 'brightness(2) sepia(1) hue-rotate(-50deg)';
    }

    if (this.isGuardBroken) {
      ctx.filter = 'grayscale(0.6) brightness(1.2)';
    }

    const cx = this.x + this.width / 2;
    const cy = this.y;
    const dir = this.facingRight ? 1 : -1;

    // --- DESENHO DETALHADO VETORIAL DOS BONECOS ---
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';

    if (this.config.type === 'ze') {
      // ZÉ PORRADA (Lutador de Muay Thai)
      ctx.fillStyle = '#e0ac69'; // Pele
      ctx.fillRect(cx - 12, cy + 25, 24, 35); // Tronco

      // Bermuda Muay Thai
      ctx.fillStyle = this.config.secondaryColor;
      ctx.fillRect(cx - 14, cy + 55, 28, 25);

      // Perna
      ctx.fillStyle = '#d09c59';
      const legH = this.isCrouching ? 15 : 30;
      ctx.fillRect(cx - 10, cy + 80, 8, legH);
      ctx.fillRect(cx + 2, cy + 80, 8, legH);

      // Cabeça
      ctx.fillStyle = '#e0ac69';
      ctx.beginPath();
      ctx.arc(cx, cy + 15, 14, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

      // Faixa Vermelha na Cabeça (Esvoaçante)
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(cx - 15, cy + 5, 30, 6);
      ctx.beginPath();
      ctx.moveTo(cx - (dir * 12), cy + 8);
      ctx.quadraticCurveTo(cx - (dir * 25) + Math.sin(this.animTimer * 0.2) * 5, cy + 12, cx - (dir * 35), cy + 5);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ff0000';
      ctx.stroke();

      // Luvas de Boxe
      ctx.fillStyle = this.config.color;
      const gloveX = this.isAttacking ? cx + (dir * 35) : cx + (dir * 12);
      ctx.beginPath();
      ctx.arc(gloveX, cy + 35, 10, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

    } else if (this.config.type === 'ninja') {
      // NINJA ZL (Cyber Ninja)
      ctx.fillStyle = '#1a1a2e'; // Traje Escuro
      ctx.fillRect(cx - 12, cy + 20, 24, 40);

      // Armadura Peitoral Neon
      ctx.fillStyle = this.config.color;
      ctx.fillRect(cx - 8, cy + 25, 16, 20);

      // Cachecol Longo com Física de Vento
      ctx.strokeStyle = '#ff0055';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx, cy + 18);
      ctx.bezierCurveTo(
        cx - (dir * 20), cy + 25 + Math.sin(this.animTimer * 0.15) * 10,
        cx - (dir * 40), cy + 10 + Math.cos(this.animTimer * 0.15) * 10,
        cx - (dir * 55), cy + 30
      );
      ctx.stroke();

      // Cabeça e Viseira Cyber
      ctx.fillStyle = '#0f0f1d';
      ctx.beginPath();
      ctx.arc(cx, cy + 12, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = this.config.secondaryColor; // Viseira Brilhante
      ctx.fillRect(cx + (dir * 2) - 6, cy + 8, 10, 4);

      // Pernas Agéis
      ctx.fillStyle = '#111';
      const legH = this.isCrouching ? 15 : 32;
      ctx.fillRect(cx - 11, cy + 60, 9, legH);
      ctx.fillRect(cx + 2, cy + 60, 9, legH);

    } else if (this.config.type === 'tonho') {
      // TONHO BRUTO (Gigante Brawler)
      ctx.fillStyle = '#c58c5c'; // Pele
      ctx.fillRect(cx - 20, cy + 15, 40, 45); // Tronco Musculoso

      // Regata Rasgada
      ctx.fillStyle = '#333';
      ctx.fillRect(cx - 16, cy + 20, 32, 35);

      // Cabeça + Cabelo Mohawk (Corte Prowhawk)
      ctx.fillStyle = '#c58c5c';
      ctx.beginPath();
      ctx.arc(cx, cy + 10, 15, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

      ctx.fillStyle = '#ffaa00'; // Mohawk Neon
      ctx.fillRect(cx - 3, cy - 8, 6, 14);

      // Calça e Botas de Combate
      ctx.fillStyle = '#2d3748';
      const legH = this.isCrouching ? 18 : 35;
      ctx.fillRect(cx - 16, cy + 60, 14, legH);
      ctx.fillRect(cx + 2, cy + 60, 14, legH);

      // Punhos Gigantes
      ctx.fillStyle = '#c58c5c';
      const fistX = this.isAttacking ? cx + (dir * 40) : cx + (dir * 16);
      ctx.beginPath();
      ctx.arc(fistX, cy + 40, 13, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }

    // Indicador VISUAL DE GUARD BREAK
    if (this.isGuardBroken) {
      ctx.fillStyle = '#00f0ff';
      ctx.font = 'bold 16px Impact';
      ctx.textAlign = 'center';
      ctx.fillText('GUARD BREAK!', cx, cy - 20);
    }

    // Aura de Especial
    if (this.superMeter >= 100) {
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy + 40, 45 + Math.sin(this.animTimer * 0.3) * 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}

// --- ENGINE PRINCIPAL DO JOGO ---
class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');

    this.keys = {};
    this.particles = [];
    this.groundY = 480;

    this.p1CharKey = 'ze';
    this.p2CharKey = 'ninja';

    this.state = 'MENU'; // MENU, PLAYING, ROUND_OVER, GAME_OVER
    this.timer = 60;
    this.timerInterval = null;

    this.setupControls();
    this.setupUI();
    this.initCharactersSelect();
  }

  setupControls() {
    window.addEventListener('keydown', (e) => {
      sfx.init();
      this.keys[e.key.toLowerCase()] = true;
      this.keys[e.key] = true;

      if (this.state === 'PLAYING') {
        // Controles de Pulo no Keydown (Instântaneo)
        if (e.key.toLowerCase() === 'w') this.p1.jump();
        if (e.key === 'ArrowUp') this.p2.jump();

        // Ataques P1
        if (e.key.toLowerCase() === 'f') this.p1.attack('light');
        if (e.key.toLowerCase() === 'g') {
          if (this.p1.superMeter >= 100) this.p1.attack('super');
          else this.p1.attack('heavy');
        }
        if (e.key.toLowerCase() === 'h') this.p1.attack('kick');

        // Ataques P2
        if (e.key.toLowerCase() === 'k') this.p2.attack('light');
        if (e.key.toLowerCase() === 'l') {
          if (this.p2.superMeter >= 100) this.p2.attack('super');
          else this.p2.attack('heavy');
        }
        if (e.key.toLowerCase() === 'ç' || e.key.toLowerCase() === 'm') this.p2.attack('kick');
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
      this.keys[e.key] = false;
    });
  }

  setupUI() {
    document.getElementById('start-btn').addEventListener('click', () => {
      this.startNewGame();
    });
  }

  initCharactersSelect() {
    const p1Container = document.getElementById('p1-options');
    const p2Container = document.getElementById('p2-options');

    p1Container.innerHTML = '';
    p2Container.innerHTML = '';

    Object.keys(CHARACTERS).forEach(key => {
      const char = CHARACTERS[key];

      const btn1 = document.createElement('button');
      btn1.className = `char-btn ${key === this.p1CharKey ? 'active' : ''}`;
      btn1.innerText = char.name;
      btn1.onclick = () => {
        this.p1CharKey = key;
        document.querySelectorAll('#p1-options .char-btn').forEach(b => b.classList.remove('active'));
        btn1.classList.add('active');
      };

      const btn2 = document.createElement('button');
      btn2.className = `char-btn ${key === this.p2CharKey ? 'active' : ''}`;
      btn2.innerText = char.name;
      btn2.onclick = () => {
        this.p2CharKey = key;
        document.querySelectorAll('#p2-options .char-btn').forEach(b => b.classList.remove('active'));
        btn2.classList.add('active');
      };

      p1Container.appendChild(btn1);
      p2Container.appendChild(btn2);
    });
  }

  startNewGame() {
    const p1Controls = { left: 'a', right: 'd', up: 'w', down: 's' };
    const p2Controls = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };

    this.p1 = new Fighter(200, 300, true, CHARACTERS[this.p1CharKey], p1Controls);
    this.p2 = new Fighter(750, 300, false, CHARACTERS[this.p2CharKey], p2Controls);

    document.getElementById('p1-name-display').innerText = CHARACTERS[this.p1CharKey].name;
    document.getElementById('p2-name-display').innerText = CHARACTERS[this.p2CharKey].name;

    document.getElementById('overlay-screen').style.display = 'none';

    this.p1.wins = 0;
    this.p2.wins = 0;
    this.updateWinsUI();

    this.startRound();
    this.state = 'PLAYING';
    this.loop();
  }

  startRound() {
    this.p1.reset(200, 300);
    this.p2.reset(750, 300);
    this.timer = 60;
    document.getElementById('timer').innerText = this.timer;

    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.state === 'PLAYING') {
        this.timer--;
        document.getElementById('timer').innerText = this.timer;
        if (this.timer <= 0) {
          this.endRound('TIMEOUT');
        }
      }
    }, 1000);
  }

  checkCollisions() {
    this.handleAttackCollision(this.p1, this.p2);
    this.handleAttackCollision(this.p2, this.p1);
  }

  handleAttackCollision(attacker, defender) {
    if (attacker.isAttacking && !attacker.attackHasHit) {
      const box = attacker.getAttackBox();
      if (
        box.x < defender.x + defender.width &&
        box.x + box.width > defender.x &&
        box.y < defender.y + defender.height &&
        box.y + box.height > defender.y
      ) {
        attacker.attackHasHit = true;
        let damage = 10;
        if (attacker.attackType === 'heavy') damage = 18;
        if (attacker.attackType === 'kick') damage = 15;
        if (attacker.attackType === 'super') damage = 35;

        const isBlocked = defender.takeDamage(damage, true, this.particles);

        // Ganhar Super ao acertar golpe
        attacker.superMeter = Math.min(100, attacker.superMeter + 12);

        // Criar Partículas de Impacto
        const px = defender.x + defender.width / 2;
        const py = defender.y + 40;
        for (let i = 0; i < 15; i++) {
          this.particles.push({
            x: px,
            y: py,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            color: isBlocked ? '#00f0ff' : '#ff0055',
            size: Math.random() * 5 + 2,
            life: 20
          });
        }
      }
    }
  }

  endRound(reason) {
    clearInterval(this.timerInterval);
    this.state = 'ROUND_OVER';

    let winner = null;
    if (reason === 'TIMEOUT') {
      if (this.p1.hp > this.p2.hp) winner = this.p1;
      else if (this.p2.hp > this.p1.hp) winner = this.p2;
    } else {
      if (this.p1.hp <= 0) winner = this.p2;
      else if (this.p2.hp <= 0) winner = this.p1;
    }

    if (winner === this.p1) this.p1.wins++;
    if (winner === this.p2) this.p2.wins++;

    this.updateWinsUI();

    setTimeout(() => {
      if (this.p1.wins >= 2 || this.p2.wins >= 2) {
        this.endGame(winner);
      } else {
        this.startRound();
        this.state = 'PLAYING';
      }
    }, 2000);
  }

  endGame(winner) {
    this.state = 'GAME_OVER';
    const overlay = document.getElementById('overlay-screen');
    const title = document.getElementById('screen-title');
    const subtitle = document.getElementById('screen-subtitle');

    title.innerText = winner ? `${winner.config.name} VENCEU!` : 'EMPATE!';
    subtitle.innerText = 'FIM DE JOGO - PRESSIONE PARA JOGAR NOVAMENTE';
    overlay.style.display = 'flex';
  }

  updateWinsUI() {
    document.querySelector('#p1-wins span').innerText = this.p1.wins;
    document.querySelector('#p2-wins span').innerText = this.p2.wins;
  }

  updateHUD() {
    document.getElementById('p1-hp').style.width = `${Math.max(0, (this.p1.hp / this.p1.maxHp) * 100)}%`;
    document.getElementById('p2-hp').style.width = `${Math.max(0, (this.p2.hp / this.p2.maxHp) * 100)}%`;

    document.getElementById('p1-guard').style.width = `${Math.max(0, (this.p1.guardStamina / this.p1.maxGuardStamina) * 100)}%`;
    document.getElementById('p2-guard').style.width = `${Math.max(0, (this.p2.guardStamina / this.p2.maxGuardStamina) * 100)}%`;

    document.getElementById('p1-super').style.width = `${this.p1.superMeter}%`;
    document.getElementById('p2-super').style.width = `${this.p2.superMeter}%`;
  }

  drawStage() {
    // Fundo Cyberpunk Retrô
    const grad = this.ctx.createLinearGradient(0, 0, 0, 576);
    grad.addColorStop(0, '#050515');
    grad.addColorStop(0.7, '#1a0033');
    grad.addColorStop(1, '#0d0d1a');
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, 1024, 576);

    // Prédios ao Fundo
    this.ctx.fillStyle = '#090918';
    for (let i = 0; i < 10; i++) {
      this.ctx.fillRect(i * 110 + 10, 200 + (i % 3) * 30, 80, 300);
    }

    // Chao estilo Grid Neon
    this.ctx.fillStyle = '#111122';
    this.ctx.fillRect(0, this.groundY, 1024, 576 - this.groundY);

    this.ctx.strokeStyle = '#ff0055';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(0, this.groundY);
    this.ctx.lineTo(1024, this.groundY);
    this.ctx.stroke();
  }

  loop() {
    // Update
    if (this.state === 'PLAYING') {
      this.p1.update(this.keys, this.p2, this.groundY, this.particles);
      this.p2.update(this.keys, this.p1, this.groundY, this.particles);
      this.checkCollisions();

      if (this.p1.hp <= 0 || this.p2.hp <= 0) {
        this.endRound('KO');
      }
    }

    this.updateHUD();

    // Partículas
    this.particles.forEach((p, index) => {
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      if (p.life <= 0) this.particles.splice(index, 1);
    });

    // Render
    this.ctx.clearRect(0, 0, 1024, 576);
    this.drawStage();

    if (this.p1 && this.p2) {
      this.p1.draw(this.ctx);
      this.p2.draw(this.ctx);
    }

    // Desenhar Partículas
    this.particles.forEach(p => {
      this.ctx.fillStyle = p.color;
      this.ctx.fillRect(p.x, p.y, p.size, p.size);
    });

    requestAnimationFrame(() => this.loop());
  }
}

// Inicializar quando a página carregar
window.onload = () => {
  new Game();
};