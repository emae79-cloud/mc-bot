const express = require('express');
const { createBot } = require('mineflayer');
const { SocksProxyAgent } = require('socks-proxy-agent');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const startupCommands = [
  "/login sifreniz123",
  "/anarşi",
  "/warp arsa"
];

const spamMessage = "Bu otomatik bir AFK spam mesajıdır!";
const spamIntervalMs = 15000;

app.post('/api/start-bots', (req, res) => {
  const { serverIp, serverPort, botNames, proxy1, proxy2 } = req.body;

  if (!serverIp || !botNames) {
    return res.json({ success: false, error: "Sunucu IP ve Bot isimleri boş olamaz!" });
  }

  // Girilen bot isimlerini virgülle ayırıp diziye çeviriyoruz (Örn: Bot1, Bot2, Bot3...)
  const namesArray = botNames.split(',').map(name => name.trim()).filter(n => n);
  const proxyList = [proxy1, proxy2].filter(p => p && p.trim() !== "");

  try {
    namesArray.forEach((username, index) => {
      let proxy = null;
      if (proxyList.length > 0) {
        proxy = proxyList[index % proxyList.length];
      }

      const botConfig = {
        username: username,
        proxy: proxy,
        host: serverIp,
        port: parseInt(serverPort) || 25565
      };

      setTimeout(() => {
        createBotInstance(botConfig);
      }, index * 3000); // 3 saniye arayla girerler
    });

    res.json({ success: true, message: `${namesArray.length} bot başlatılıyor!` });
  } catch (error) {
    res.json({ success: false, error: error.message });
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

  bot.on('spawn', () => {
    console.log(`${config.username} oyuna giriş yaptı!`);

    startupCommands.forEach((cmd, cmdIndex) => {
      setTimeout(() => {
        bot.chat(cmd);
      }, (cmdIndex + 1) * 2000);
    });

    setInterval(() => {
      bot.chat(spamMessage);
    }, spamIntervalMs);
  });

  bot.on('kicked', (reason) => {
    console.log(`${config.username} atıldı: ${reason}`);
  });

  bot.on('error', (err) => {
    console.log(`${config.username} hata: ${err.message}`);
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sunucu aktif: port ${PORT}`);
});