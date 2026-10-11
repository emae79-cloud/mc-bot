const express = require('express');
const { createBot } = require('mineflayer');
const { SocksProxyAgent } = require('socks-proxy-agent');
const app = express();

app.use(express.json());
app.use(express.static('public'));

let activeBots = {}; // Botları ve durumlarını tutar
let globalSpamConfig = { text: "Bu otomatik bir AFK spam mesajıdır!", interval: 15000 };

// Botları Başlatma Endpoint'i
app.post('/api/start-bots', (req, res) => {
  const { serverIp, serverPort, botsData, proxy1, proxy2, spamText, spamTime } = req.body;

  if (!serverIp || !botsData) {
    return res.json({ success: false, error: "Sunucu IP ve bot bilgileri boş olamaz!" });
  }

  if (spamText) globalSpamConfig.text = spamText;
  if (spamTime) globalSpamConfig.interval = parseInt(spamTime) * 1000;

  const botLines = botsData.split('\n').filter(line => line.trim() !== "");
  const proxyList = [proxy1, proxy2].filter(p => p && p.trim() !== "");

  try {
    botLines.forEach((line, index) => {
      const parts = line.trim().split(/\s+/);
      const username = parts[0];
      const password = parts[1] || "";

      if (!username) return;

      let proxy = null;
      if (proxyList.length > 0) {
        proxy = proxyList[index % proxyList.length];
      }

      const config = {
        username: username,
        password: password,
        proxy: proxy,
        host: serverIp,
        port: parseInt(serverPort) || 25565
      };

      setTimeout(() => {
        createBotInstance(config);
      }, index * 3000);
    });

    res.json({ success: true, message: `${botLines.length} bot başlatılıyor (Auto-Reconnect aktif)!` });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Tüm Botların Canlı Durumlarını ve Loglarını Çekme Endpoint'i
app.get('/api/status', (req, res) => {
  let statusData = {};
  for (let name in activeBots) {
    statusData[name] = {
      status: activeBots[name].status,
      health: activeBots[name].health,
      food: activeBots[name].food,
      logs: activeBots[name].logs.slice(-15) // Son 15 log satırı
    };
  }
  res.json(statusData);
});

// Tek Bir Botu Durdurma
app.post('/api/stop-bot', (req, res) => {
  const { botName } = req.body;
  if (activeBots[botName] && activeBots[botName].bot) {
    activeBots[botName].manualStop = true;
    activeBots[botName].bot.quit();
    delete activeBots[botName];
    return res.json({ success: true, message: `${botName} durduruldu.` });
  }
  res.json({ success: false, error: "Bot bulunamadı." });
});

// Bot Aksiyonları (Hareket, Sohbet, Envanter)
app.post('/api/bot-action', (req, res) => {
  const { botName, action, value } = req.body;
  const botObj = activeBots[botName];

  if (!botObj || !botObj.bot) {
    return res.json({ success: false, error: "Bot oyunda veya aktif değil!" });
  }
  const bot = botObj.bot;

  try {
    switch (action) {
      case 'forward': bot.setControlState('forward', true); setTimeout(() => bot.setControlState('forward', false), 500); break;
      case 'back': bot.setControlState('back', true); setTimeout(() => bot.setControlState('back', false), 500); break;
      case 'left': bot.setControlState('left', true); setTimeout(() => bot.setControlState('left', false), 500); break;
      case 'right': bot.setControlState('right', true); setTimeout(() => bot.setControlState('right', false), 500); break;
      case 'jump': bot.setControlState('jump', true); setTimeout(() => bot.setControlState('jump', false), 300); break;
      case 'chat': bot.chat(value); break;
      case 'inventory':
        const items = bot.inventory.items().map(item => ({
          name: item.name,
          count: item.count,
          displayName: item.displayName || item.name
        }));
        return res.json({ success: true, inventory: items });
    }
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

function createBotInstance(config) {
  if (activeBots[config.username] && activeBots[config.username].manualStop) return;

  const options = {
    host: config.host,
    port: config.port,
    username: config.username,
    version: false
  };

  if (config.proxy) {
    options.agent = new SocksProxyAgent(`socks://${config.proxy}`);
  }

  const bot = createBot(options);

  if (!activeBots[config.username]) {
    activeBots[config.username] = { logs: [], status: "Bağlanıyor...", health: 20, food: 20, manualStop: false };
  }
  activeBots[config.username].bot = bot;

  function addLog(msg) {
    const time = new Date().toLocaleTimeString();
    const fullMsg = `[${time}] ${msg}`;
    if (activeBots[config.username]) {
      activeBots[config.username].logs.push(fullMsg);
      if (activeBots[config.username].logs.length > 50) activeBots[config.username].logs.shift();
    }
  }

  bot.on('spawn', () => {
    addLog("Oyuna başarıyla giriş yaptı!");
    activeBots[config.username].status = "Aktif (Oyunda)";

    if (config.password) {
      setTimeout(() => {
        bot.chat(`/login ${config.password}`);
        addLog("Otomatik şifre gönderildi.");
      }, 2000);
    }

    // Spam Döngüsü
    const spamId = setInterval(() => {
      bot.chat(globalSpamConfig.text);
      addLog(`Spam gönderildi: ${globalSpamConfig.text}`);
    }, globalSpamConfig.interval);
    activeBots[config.username].spamIntervalId = spamId;

    // Olmazsa Olmaz: Anti-AFK Kafa Çevirme (Atılmamak için)
    const antiAfkId = setInterval(() => {
      const yaw = Math.random() * Math.PI * 2;
      const pitch = (Math.random() * Math.PI) - (Math.PI / 2);
      bot.look(yaw, pitch, true);
    }, 12000);
    activeBots[config.username].antiAfkId = antiAfkId;
  });

  bot.on('health', () => {
    if (bot.health !== undefined) activeBots[config.username].health = bot.health;
    if (bot.food !== undefined) activeBots[config.username].food = bot.food;
  });

  bot.on('chat', (username, message) => {
    if (username !== bot.username) {
      addLog(`<${username}> ${message}`);
    }
  });

  bot.on('kicked', (reason) => {
    addLog(`Atıldı! Sebep: ${reason}`);
    cleanupAndReconnect(config);
  });

  bot.on('end', (reason) => {
    addLog(`Bağlantı koptu: ${reason}`);
    cleanupAndReconnect(config);
  });

  bot.on('error', (err) => {
    addLog(`Hata: ${err.message}`);
  });
}

function cleanupAndReconnect(config) {
  if (activeBots[config.username]) {
    if (activeBots[config.username].spamIntervalId) clearInterval(activeBots[config.username].spamIntervalId);
    if (activeBots[config.username].antiAfkId) clearInterval(activeBots[config.username].antiAfkId);
    
    if (activeBots[config.username].manualStop) return; // Manuel durdurulduysa tekrar bağlanma

    activeBots[config.username].status = "Koptu, 5s sonra bağlanacak...";
  }

  // Auto-Reconnect (Otomatik Yeniden Bağlanma)
  setTimeout(() => {
    if (!activeBots[config.username] || !activeBots[config.username].manualStop) {
      createBotInstance(config);
    }
  }, 5000);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sunucu aktif: port ${PORT}`);
});
