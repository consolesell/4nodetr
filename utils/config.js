const fs = require('fs');
const path = require('path');
require('dotenv').config();

class Config {
    constructor() {
        this.config = this.loadConfig();
        this.validateConfig();
    }

    loadConfig() {
        try {
            const configPath = path.join(__dirname, '../config.json');
            const configFile = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(configFile);
        } catch (error) {
            console.error('Failed to load config.json:', error.message);
            process.exit(1);
        }
    }

    validateConfig() {
        // Validate required environment variables
        const required = ['DERIV_APP_ID', 'DERIV_TOKEN'];
        const missing = required.filter(key => !process.env[key]);

        if (missing.length > 0) {
            console.error(`Missing required environment variables: ${missing.join(', ')}`);
            console.error('Please check your .env file');
            process.exit(1);
        }
    }

    get(path, defaultValue = undefined) {
        const keys = path.split('.');
        let value = this.config;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return defaultValue;
            }
        }

        return value;
    }

    // Convenience getters
    get appId() {
        return process.env.DERIV_APP_ID;
    }

    get token() {
        return process.env.DERIV_TOKEN;
    }

    get symbol() {
        return process.env.SYMBOL || this.get('trading.symbol', 'R_10');
    }

    get baseStake() {
        return parseFloat(process.env.BASE_STAKE) || this.get('trading.baseStake', 1);
    }

    get duration() {
        return parseInt(process.env.DURATION) || this.get('trading.duration', 1);
    }

    get enableTrading() {
        return process.env.ENABLE_TRADING !== 'false';
    }
}

module.exports = new Config();