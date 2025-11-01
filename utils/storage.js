const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class Storage {
    constructor(dataDir = './data') {
        this.dataDir = dataDir;
        this.cache = new Map();
    }

    async init() {
        try {
            await fs.mkdir(this.dataDir, { recursive: true });
            logger.system('Storage initialized');
        } catch (error) {
            logger.error(`Failed to initialize storage: ${error.message}`);
            throw error;
        }
    }

    getFilePath(key) {
        return path.join(this.dataDir, `${key}.json`);
    }

    async get(key, defaultValue = null) {
        try {
            // Check cache first
            if (this.cache.has(key)) {
                return this.cache.get(key);
            }

            const filePath = this.getFilePath(key);
            const data = await fs.readFile(filePath, 'utf8');
            const parsed = JSON.parse(data);

            // Update cache
            this.cache.set(key, parsed);

            return parsed;
        } catch (error) {
            if (error.code === 'ENOENT') {
                return defaultValue;
            }
            logger.error(`Failed to read ${key}: ${error.message}`);
            return defaultValue;
        }
    }

    async set(key, value) {
        try {
            const filePath = this.getFilePath(key);
            await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');

            // Update cache
            this.cache.set(key, value);

            return true;
        } catch (error) {
            logger.error(`Failed to write ${key}: ${error.message}`);
            return false;
        }
    }

    async delete(key) {
        try {
            const filePath = this.getFilePath(key);
            await fs.unlink(filePath);
            this.cache.delete(key);
            return true;
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logger.error(`Failed to delete ${key}: ${error.message}`);
            }
            return false;
        }
    }

    clearCache() {
        this.cache.clear();
    }
}

module.exports = new Storage();