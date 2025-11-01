const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format
const customFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
        return `[${timestamp}] ${level.toUpperCase()}: ${stack || message}`;
    })
);

// Console format with colors
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => {
        return `[${timestamp}] ${level}: ${message}`;
    })
);

// Create logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: customFormat,
    transports: [
        // Console output
        new winston.transports.Console({
            format: consoleFormat
        }),

        // Trade logs
        new DailyRotateFile({
            filename: path.join(logsDir, 'trades-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '30d',
            level: 'info'
        }),

        // Error logs
        new DailyRotateFile({
            filename: path.join(logsDir, 'errors-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '30d',
            level: 'error'
        }),

        // Performance logs
        new DailyRotateFile({
            filename: path.join(logsDir, 'performance-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '30d',
            level: 'debug'
        })
    ]
});

// Wrapper functions for type-specific logging
logger.trade = (message) => logger.info(`[TRADE] ${message}`);
logger.analysis = (message) => logger.debug(`[ANALYSIS] ${message}`);
logger.performance = (message) => logger.info(`[PERFORMANCE] ${message}`);
logger.system = (message) => logger.info(`[SYSTEM] ${message}`);

module.exports = logger;