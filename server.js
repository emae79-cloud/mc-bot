const express = require('express');
const { createBot } = require('mineflayer');
const { SocksProxyAgent } = require('socks-proxy-agent');
const app = express();

app.use(express.json());
app.use(express.static('public'));

// Aktif botları tutacağımız hafıza
let activeBots = {};

// Botları Başlatma Endpoint'i
app.post('/api/start-bots', (req, res) => {
  const { serverIp, serverPort, botsData, proxy1, proxy2 } = req.body;

  if (!serverIp || !botsData) {
    return res.json({ success: false, error: "Sunucu IP ve bot bilgileri boş olamaz!" });
  }

  // botsData formatı: "Bot1 sifre1\nBot2 sifre2" şeklinde satır satır gelir
  const botLines = botsData.split('\n').filter(line => line.trim() !== "");
  const proxyList = [proxy1, proxy2].filter(p => p && p.trim() !== "");

  try {
    botLines.forEach((line, index) => {
      const parts = line.trim().split(/\s+/);
      const username = parts[0];
      const password = parts[1] || ""; // Eğer şifre girilmediyse boş bırakır

      if (!username) return;

      let proxy = null;
      if (proxyList.length > 0) {
        proxy = proxyList[index % proxyList.length];
      }

      const botConfig = {
        username: username,
        password: password,
        proxy: proxy,
        host: serverIp,
        port: parseInt(serverPort) || 25565
      };

      setTimeout(() => {
        createBotInstance(botConfig);
      }, index * 3000);
    });

    res.json({ success: true, message: `${botLines.length} bot sırayla başlatılıyor!` });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Bot Aksiyonları (Hareket, Komut, Envanter vb.)
app.post('/api/bot-action', (req, res) => {
  const { botName, action, value } = req.body;
  const bot = activeBots[botName];

  if (!bot) {
    return res.json({ success: false, error: "Bot oyunda veya aktif değil!" });
  }

  try {
    switch (action) {
      case 'forward': bot.setControlState('forward', true); setTimeout(() => bot.setControlState('forward', false), 500); break;
      case 'back': bot.setControlState('back', true); setTimeout(() => bot.setControlState('back', false), 500); break;
      case 'left': bot.setControlState('left', true); setTimeout(() => bot.setControlState('left', false), 500); break;
      case 'right': bot.setControlState('right', true); setTimeout(() => bot.setControlState('right', false), 500); break;
      case 'jump': bot.setControlState('jump', true); setTimeout(() => bot.setControlState('jump', false), 300); break;
      case 'chat': bot.chat(value); break;
      case 'inventory':
        // Envanterdeki eşyaları ve isimlerini toplama
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
  activeBots[config.username] = bot;

  bot.on('spawn', () => {
    console.log(`${config.username} oyuna giriş yaptı!`);

    // Eğer şifre tanımlandıysa otomatik login komutu gönder
    if (config.password) {
      setTimeout(() => {
        bot.chat(`/login ${config.password}`);
      }, 2000);
    }

    // Spam mesaj döngüsü (15 saniyede bir)
    setInterval(() => {
      bot.chat("Bu otomatik bir AFK spam mesajıdır!");
    }, 15000);
  });

  bot.on('end', () => {
    delete activeBots[config.username];
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sunucu aktif: port ${PORT}`);
});
