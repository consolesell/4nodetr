const axios = require('axios');
const logger = require('./logger');

class TelegramNotifier {
    constructor() {
        this.botToken = process.env.TELEGRAM_BOT_TOKEN;
        this.chatId = process.env.TELEGRAM_CHAT_ID;
        this.enabled = this.botToken && this.chatId;

        if (this.enabled) {
            logger.system('Telegram notifications enabled');
        }
    }

    async send(message) {
        if (!this.enabled) return;

        try {
            await axios.post(
                `https://api.telegram.org/bot${this.botToken}/sendMessage`,
                {
                    chat_id: this.chatId,
                    text: message,
                    parse_mode: 'HTML'
                }
            );
        } catch (error) {
            logger.error(`Telegram notification failed: ${error.message}`);
        }
    }

    notifyTrade(prediction, stake, confidence) {
        const message = `
🎯 <b>New Trade</b>
Prediction: ${prediction.toUpperCase()}
Stake: $${stake}
Confidence: ${(confidence * 100).toFixed(1)}%
        `.trim();
        this.send(message);
    }

    notifyResult(profit, winRate) {
        const emoji = profit > 0 ? '✅' : '❌';
        const message = `
${emoji} <b>Trade Result</b>
Profit: $${profit.toFixed(2)}
Win Rate: ${winRate}%
        `.trim();
        this.send(message);
    }

    notifyDailyStats(wins, losses, totalProfit) {
        const message = `
📊 <b>Daily Summary</b>
Wins: ${wins}
Losses: ${losses}
Total P/L: $${totalProfit.toFixed(2)}
        `.trim();
        this.send(message);
    }
}

module.exports = new TelegramNotifier();