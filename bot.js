#!/usr/bin/env node

const WebSocket = require('ws');
const logger = require('./utils/logger');
const storage = require('./utils/storage');
const config = require('./utils/config');

// ============================================================================
// DERIV TRADING BOT - Cloud Edition with Advanced ML
// ============================================================================

class DerivTradingBot {
    constructor() {
        // WebSocket
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        
        // Trading state
        this.isBotRunning = false;
        this.isPending = false;
        this.currentContractId = null;
        this.balanceSubscriptionId = null;
        this.nextTradeTime = 0;
        
        // Data
        this.tickHistory = [];
        this.tradeHistory = [];
        
        // Learning structures
        this.qTable = null;
        this.deepQTable = null;
        this.metaQTable = null;
        this.patternMemory = [];
        this.contextMemory = [];
        this.modelPerformance = this.initModelPerformance();
        
        // Statistics
        this.wins = 0;
        this.losses = 0;
        this.consecutiveLosses = 0;
        this.balance = 0;
        
        // Learning parameters
        this.currentLearningRate = config.get('learning.baseLearningRate');
        this.smoothedConfidence = 0.5;
        this.currentMode = 'balanced';
        
        // Reasoning health
        this.reasoningHealth = {
            confidenceVariance: [],
            recentWinRate: 0,
            modelDisagreement: 0,
            lastHealthScore: 1.0
        };
        
        // Data integrity
        this.dataIntegrity = {
            score: 1.0,
            recentAnomalies: 0
        };
        
        // Performance tracking
        this.startTime = Date.now();
        this.lastPerformanceLog = Date.now();
    }

    initModelPerformance() {
        return {
            stat: { correct: 0, total: 0 },
            markov: { correct: 0, total: 0 },
            trend: { correct: 0, total: 0 },
            qlearning: { correct: 0, total: 0 },
            streak: { correct: 0, total: 0 },
            pattern: { correct: 0, total: 0 },
            entropy: { correct: 0, total: 0 },
            cycle: { correct: 0, total: 0 }
        };
    }

    // ========================================================================
    // INITIALIZATION & PERSISTENCE
    // ========================================================================

    async initialize() {
        try {
            logger.system('═══════════════════════════════════════');
            logger.system('🚀 Initializing Deriv Cloud Trading Bot');
            logger.system('═══════════════════════════════════════');
            
            // Initialize storage
            await storage.init();
            
            // Load persisted data
            await this.loadPersistedData();
            
            logger.system(`Configuration loaded: ${config.symbol} | Stake: $${config.baseStake} | Duration: ${config.duration}t`);
            logger.system(`Learning Rate: ${this.currentLearningRate.toFixed(4)} | Mode: ${this.currentMode}`);
            logger.system(`Trading: ${config.enableTrading ? 'ENABLED' : 'DISABLED (Dry Run)'}`);
            
            // Setup graceful shutdown
            this.setupGracefulShutdown();
            
            // Connect to Deriv
            await this.connect();
            
        } catch (error) {
            logger.error(`Initialization failed: ${error.message}`);
            process.exit(1);
        }
    }

    async loadPersistedData() {
        try {
            // Load Q-tables
            this.qTable = await storage.get('qtables', this.getDefaultQTable());
            this.deepQTable = await storage.get('deepQtables', this.getDefaultDeepQTable());
            this.metaQTable = await storage.get('metaQtables', this.getDefaultMetaQTable());
            
            // Load memories
            this.patternMemory = await storage.get('patternMemory', []);
            this.contextMemory = await storage.get('contextMemory', []);
            
            // Load performance
            const savedPerformance = await storage.get('modelPerformance');
            if (savedPerformance) {
                this.modelPerformance = savedPerformance;
            }
            
            // Load trade history (last 100 trades)
            this.tradeHistory = await storage.get('tradeHistory', []);
            
            logger.system(`Loaded: ${Object.keys(this.qTable).length} Q-states, ${this.patternMemory.length} patterns, ${this.contextMemory.length} contexts`);
            
        } catch (error) {
            logger.error(`Failed to load persisted data: ${error.message}`);
        }
    }

    async savePersistedData() {
        try {
            await Promise.all([
                storage.set('qtables', this.qTable),
                storage.set('deepQtables', this.deepQTable),
                storage.set('metaQtables', this.metaQTable),
                storage.set('patternMemory', this.patternMemory),
                storage.set('contextMemory', this.contextMemory),
                storage.set('modelPerformance', this.modelPerformance),
                storage.set('tradeHistory', this.tradeHistory.slice(-100))
            ]);
        } catch (error) {
            logger.error(`Failed to save persisted data: ${error.message}`);
        }
    }

    getDefaultQTable() {
        return {
            odd: { odd: 0.5, even: 0.5 },
            even: { odd: 0.5, even: 0.5 }
        };
    }

    getDefaultDeepQTable() {
        const table = {};
        for (let volatility of ['low', 'medium', 'high']) {
            for (let trend of ['bullish', 'neutral', 'bearish']) {
                for (let streak of ['short', 'medium', 'long']) {
                    table[`${volatility}_${trend}_${streak}`] = { odd: 0.5, even: 0.5 };
                }
            }
        }
        return table;
    }

    getDefaultMetaQTable() {
        const table = {};
        for (let vol of ['low', 'medium', 'high']) {
            for (let ent of ['low', 'medium', 'high']) {
                table[`${vol}_${ent}`] = {
                    conservative: 0.5,
                    balanced: 0.5,
                    aggressive: 0.5
                };
            }
        }
        return table;
    }

    // Continue in Part 2...
    // ========================================================================
// WEBSOCKET CONNECTION
// ========================================================================

    async connect() {
        return new Promise((resolve, reject) => {
            if (this.ws) {
                this.ws.close();
            }

            const wsUrl = `wss://ws.derivws.com/websockets/v3?app_id=${config.appId}`;
            logger.system(`Connecting to Deriv API...`);
            
            this.ws = new WebSocket(wsUrl);

            this.ws.on('open', () => {
                logger.system('✅ WebSocket connected');
                this.reconnectAttempts = 0;
                this.authorize();
                resolve();
            });

            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });

            this.ws.on('close', () => {
                this.isConnected = false;
                logger.system('❌ WebSocket disconnected');
                this.handleDisconnect();
            });

            this.ws.on('error', (error) => {
                logger.error(`WebSocket error: ${error.message}`);
                reject(error);
            });

            // Connection timeout
            setTimeout(() => {
                if (!this.isConnected) {
                    reject(new Error('Connection timeout'));
                }
            }, 10000);
        });
    }

    authorize() {
        this.send({ authorize: config.token });
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            logger.error('Cannot send: WebSocket not connected');
        }
    }

    handleDisconnect() {
        if (config.get('reconnect.enabled') && this.reconnectAttempts < config.get('reconnect.maxAttempts')) {
            this.reconnectAttempts++;
            const delay = config.get('reconnect.intervalMs');
            
            logger.system(`Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${config.get('reconnect.maxAttempts')})...`);
            
            this.reconnectTimer = setTimeout(() => {
                this.connect().catch(error => {
                    logger.error(`Reconnection failed: ${error.message}`);
                });
            }, delay);
        } else {
            logger.error('Max reconnection attempts reached. Exiting...');
            process.exit(1);
        }
    }

    // ========================================================================
    // MESSAGE HANDLING
    // ========================================================================

    async handleMessage(data) {
        try {
            const message = JSON.parse(data);
            const msgType = message.msg_type;

            if (message.error) {
                logger.error(`API Error: ${message.error.message}`);
                if (msgType === 'proposal') {
                    this.isPending = false;
                }
                return;
            }

            switch (msgType) {
                case 'authorize':
                    await this.handleAuthorize(message);
                    break;
                case 'balance':
                    this.handleBalance(message);
                    break;
                case 'history':
                    await this.handleHistory(message);
                    break;
                case 'tick':
                    await this.handleTick(message);
                    break;
                case 'proposal':
                    await this.handleProposal(message);
                    break;
                case 'buy':
                    this.handleBuy(message);
                    break;
                case 'proposal_open_contract':
                    await this.handleContractUpdate(message);
                    break;
                default:
                    // Ignore other message types
                    break;
            }
        } catch (error) {
            logger.error(`Message handling error: ${error.message}`);
        }
    }

    async handleAuthorize(message) {
        this.isConnected = true;
        this.balance = parseFloat(message.authorize.balance);
        
        logger.system('✅ Authorized successfully');
        logger.system(`💰 Balance: $${this.balance.toFixed(2)} ${message.authorize.currency}`);
        logger.system(`👤 Account: ${message.authorize.loginid}`);
        
        // Subscribe to balance updates
        this.send({ balance: 1, subscribe: 1 });
        
        // Fetch historical data
        logger.system(`📊 Fetching historical ticks for ${config.symbol}...`);
        this.send({
            ticks_history: config.symbol,
            end: 'latest',
            count: 5000,
            style: 'ticks'
        });
    }

    handleBalance(message) {
        this.balance = parseFloat(message.balance.balance);
        logger.debug(`Balance updated: $${this.balance.toFixed(2)}`);
    }

    async handleHistory(message) {
        const history = message.history;
        if (history && history.times && history.prices) {
            const historicalTicks = [];
            
            for (let i = 0; i < history.times.length; i++) {
                const epoch = history.times[i];
                const quote = parseFloat(history.prices[i]);
                
                if (isNaN(quote)) continue;
                
                const digit = Math.floor(quote * 100) % 10;
                historicalTicks.push({ epoch, quote, digit });
            }
            
            this.tickHistory = historicalTicks;
            
            // Limit history size
            const maxHistory = config.get('limits.maxHistory');
            if (this.tickHistory.length > maxHistory) {
                this.tickHistory = this.tickHistory.slice(-maxHistory);
            }
            
            logger.system(`📈 Loaded ${historicalTicks.length} historical ticks`);
            logger.system(`📊 Total tick history: ${this.tickHistory.length}`);
            
            // Subscribe to real-time ticks
            this.send({ ticks: config.symbol, subscribe: 1 });
            logger.system(`🔔 Subscribed to real-time ticks for ${config.symbol}`);
            
            // Start bot
            await this.startBot();
        }
    }

    async handleTick(message) {
        const quote = parseFloat(message.tick.quote);
        
        if (isNaN(quote)) {
            logger.error('Invalid tick quote received');
            return;
        }
        
        const digit = Math.floor(quote * 100) % 10;
        const newTick = { 
            epoch: message.tick.epoch,
            quote, 
            digit 
        };
        
        // Prevent duplicate ticks
        if (this.tickHistory.length === 0 || newTick.epoch > this.tickHistory[this.tickHistory.length - 1].epoch) {
            // Validate tick data
            const previousTick = this.tickHistory.length > 0 ? this.tickHistory[this.tickHistory.length - 1] : null;
            const isValid = this.validateTickData(newTick, previousTick);
            
            this.tickHistory.push(newTick);
            
            // Limit history size
            const maxHistory = config.get('limits.maxHistory');
            if (this.tickHistory.length > maxHistory) {
                this.tickHistory.shift();
            }
            
            // Auto-tune learning parameters periodically
            if (this.tickHistory.length % 50 === 0) {
                this.autoTuneLearningParameters();
            }
            
            // Log performance periodically
            if (Date.now() - this.lastPerformanceLog > 300000) { // Every 5 minutes
                this.logPerformance();
                this.lastPerformanceLog = Date.now();
            }
            
            // Execute trade logic
            if (this.isBotRunning && 
                !this.currentContractId && 
                Date.now() >= this.nextTradeTime && 
                !this.isPending && 
                isValid) {
                
                // Check cooldown conditions
                if (!this.shouldEnterCooldown()) {
                    // Small delay to prevent rapid-fire trades
                    setTimeout(() => this.analyzeAndTrade(), 100);
                }
            }
        }
    }

    async handleProposal(message) {
        const proposal = message.proposal;
        
        if (proposal && proposal.id) {
            if (config.enableTrading) {
                this.send({
                    buy: proposal.id,
                    price: proposal.ask_price
                });
                logger.trade(`💸 Buying ${proposal.contract_type} | Price: $${proposal.ask_price}`);
            } else {
                logger.trade(`[DRY RUN] Would buy ${proposal.contract_type} | Price: $${proposal.ask_price}`);
                this.isPending = false;
                
                // Simulate contract completion for dry run
                setTimeout(() => {
                    const simulatedProfit = Math.random() > 0.5 ? proposal.ask_price * 0.95 : -proposal.ask_price;
                    this.handleSimulatedContractClose(simulatedProfit);
                }, 3000);
            }
        } else {
            this.isPending = false;
        }
    }

    handleBuy(message) {
        this.currentContractId = message.buy.contract_id;
        this.isPending = false;
        
        logger.trade(`✅ Contract purchased: ${this.currentContractId}`);
        logger.trade(`💰 Buy price: $${message.buy.buy_price}`);
        
        // Subscribe to contract updates
        this.send({
            proposal_open_contract: 1,
            contract_id: this.currentContractId,
            subscribe: 1
        });
    }

    async handleContractUpdate(message) {
        const contract = message.proposal_open_contract;
        
        if (contract.contract_id === this.currentContractId && 
            (contract.is_sold || contract.status === 'sold')) {
            
            const profit = parseFloat(contract.profit);
            const payout = parseFloat(contract.payout || 0);
            
            const profitStatus = profit > 0 ? '✅ WIN' : '❌ LOSS';
            logger.trade(`${profitStatus} | Contract: ${this.currentContractId}`);
            logger.trade(`💵 Profit: $${profit.toFixed(2)} | Payout: $${payout.toFixed(2)}`);
            
            await this.processContractResult(profit);
            
            // Unsubscribe from contract updates
            this.send({ forget: message.subscription.id });
            
            // Reset state
            this.currentContractId = null;
            this.nextTradeTime = Date.now() + config.get('trading.cooldownMs');
        }
    }

    handleSimulatedContractClose(profit) {
        const profitStatus = profit > 0 ? '✅ WIN' : '❌ LOSS';
        logger.trade(`[DRY RUN] ${profitStatus} | Simulated Profit: $${profit.toFixed(2)}`);
        
        this.processContractResult(profit);
        this.currentContractId = null;
        this.nextTradeTime = Date.now() + config.get('trading.cooldownMs');
    }

    // ========================================================================
    // TRADING LOGIC
    // ========================================================================

    async startBot() {
        if (this.tickHistory.length < 30) {
            logger.system('⏳ Waiting for sufficient tick history...');
            return;
        }
        
        this.isBotRunning = true;
        
        logger.system('═══════════════════════════════════════');
        logger.system('🚀 BOT STARTED - META-REASONING ENABLED');
        logger.system('═══════════════════════════════════════');
        logger.system(`Learning Rate: ${this.currentLearningRate.toFixed(4)}`);
        logger.system(`Confidence Threshold: ${config.get('learning.baseConfidenceThreshold')}`);
        logger.system(`Mode: ${this.currentMode}`);
        logger.system(`Features: Bayesian Fusion, Context Memory, Meta-Q-Learning`);
        logger.system('═══════════════════════════════════════');
    }

    async stopBot() {
        this.isBotRunning = false;
        logger.system('🛑 Bot stopped');
        
        await this.logFinalStatistics();
        await this.savePersistedData();
    }

    async analyzeAndTrade() {
        if (this.tickHistory.length < 30) {
            logger.analysis('Not enough history for analysis');
            return;
        }

        this.isPending = true;

        const recent = this.tickHistory.slice(-500);
        const lastDigitNum = recent[recent.length - 1].digit;
        const state = lastDigitNum % 2 === 1 ? 'odd' : 'even';

        // === Model 1: Statistical Probability ===
        const { oddProb: statProbOdd, evenProb: statProbEven } = this.calculateStatisticalProbability(recent);

        // === Model 2: Markov Chain ===
        const markovProbs = this.calculateMarkovProbabilities(recent);
        let markovProbOdd = state === 'odd' ? markovProbs.oddToOdd : markovProbs.evenToOdd;
        let markovProbEven = state === 'odd' ? markovProbs.oddToEven : markovProbs.evenToEven;

        // === Model 3: Trend Analysis ===
        const volatility = this.calculateVolatility(recent, 50);
        const { emaShort, emaLong } = this.calculateEMAs(recent);
        const trendStrength = (emaShort - emaLong) / emaLong;
        const trendScore = Math.tanh(trendStrength * 10) * 0.1;
        const volatilityAdjustment = volatility > 0.6 ? -0.08 : volatility < 0.3 ? 0.05 : 0;

        // === Model 4: Q-Learning ===
        const qProbOdd = this.qTable[state].odd;
        const qProbEven = this.qTable[state].even;
        
        const deepState = this.getDeepState(volatility, trendStrength, this.calculateStreak(recent).length);
        const { deepQProbOdd, deepQProbEven } = this.getDeepQProbs(deepState);
        
        const blendedQOdd = qProbOdd * 0.4 + deepQProbOdd * 0.6;
        const blendedQEven = qProbEven * 0.4 + deepQProbEven * 0.6;

        // === Model 5: Streak Analysis ===
        const streak = this.calculateStreak(recent);
        const { streakAdjustmentOdd, streakAdjustmentEven } = this.calculateStreakAdjustments(streak);

        // === Model 6: Pattern Recognition ===
        const { patternProbOdd, patternProbEven } = this.analyzePatterns(recent);

        // === Model 7: Entropy Analysis ===
        const entropy = this.calculateEntropy(recent, 50);
        const { entropyAdjustmentOdd, entropyAdjustmentEven } = this.calculateEntropyAdjustments(entropy, state);

        // === Model 8: Cyclic Pattern Detection ===
        const cycleInfo = this.detectCyclicPattern(recent, 20);
        const { cycleProbOdd, cycleProbEven } = this.analyzeCyclicPattern(cycleInfo, recent);

        // === Context Memory Enhancement ===
        const contextBias = this.getContextBias(volatility, entropy, streak.length);

        // === Ensemble: Adaptive Weighted Combination ===
        const adaptiveWeights = this.getAdaptiveWeights();
        
        const modelPredictions = {
            stat: statProbOdd > statProbEven ? 'odd' : 'even',
            markov: markovProbOdd > markovProbEven ? 'odd' : 'even',
            trend: (0.5 + trendScore + volatilityAdjustment) > 0.5 ? 'odd' : 'even',
            qlearning: blendedQOdd > blendedQEven ? 'odd' : 'even',
            streak: (0.5 + streakAdjustmentOdd) > (0.5 + streakAdjustmentEven) ? 'odd' : 'even',
            pattern: patternProbOdd > patternProbEven ? 'odd' : 'even',
            entropy: (0.5 + entropyAdjustmentOdd) > (0.5 + entropyAdjustmentEven) ? 'odd' : 'even',
            cycle: cycleProbOdd > cycleProbEven ? 'odd' : 'even'
        };

        // Check model consensus
        const consensus = this.checkModelConsensus(modelPredictions);

        // Bayesian Fusion
        const modelProbs = {
            stat: { odd: statProbOdd, even: statProbEven },
            markov: { odd: markovProbOdd, even: markovProbEven },
            trend: { odd: 0.5 + trendScore + volatilityAdjustment, even: 0.5 - trendScore + volatilityAdjustment },
            qlearning: { odd: blendedQOdd, even: blendedQEven },
            streak: { odd: 0.5 + streakAdjustmentOdd, even: 0.5 + streakAdjustmentEven },
            pattern: { odd: patternProbOdd, even: patternProbEven },
            entropy: { odd: 0.5 + entropyAdjustmentOdd, even: 0.5 + entropyAdjustmentEven },
            cycle: { odd: cycleProbOdd, even: cycleProbEven }
        };

        const bayesianResult = this.bayesianFusion(modelProbs, adaptiveWeights);
        let finalProbOdd = bayesianResult.odd + contextBias;
        let finalProbEven = bayesianResult.even - contextBias;

        // Apply cycle influence
        if (cycleInfo.hasCycle) {
            finalProbOdd = finalProbOdd * 0.85 + cycleProbOdd * 0.15;
            finalProbEven = finalProbEven * 0.85 + cycleProbEven * 0.15;
        }

        // Data integrity weighting
        if (this.dataIntegrity.score < 0.9) {
            const integrityFactor = this.dataIntegrity.score;
            finalProbOdd = finalProbOdd * integrityFactor + 0.5 * (1 - integrityFactor);
            finalProbEven = finalProbEven * integrityFactor + 0.5 * (1 - integrityFactor);
        }

        // Normalize
        const total = finalProbOdd + finalProbEven;
        finalProbOdd /= total;
        finalProbEven /= total;

        // Determine prediction
        let prediction;
        let rawConfidence = Math.max(finalProbOdd, finalProbEven);
        
        // Mode-based epsilon
        let modeEpsilon = config.get('learning.epsilon');
        if (this.currentMode === 'exploration') modeEpsilon = 0.1;
        else if (this.currentMode === 'precision') modeEpsilon = 0.0;
        
        // Epsilon-greedy exploration
        if (Math.random() < modeEpsilon) {
            prediction = Math.random() < 0.5 ? 'odd' : 'even';
            rawConfidence = 0.5;
            logger.analysis('🔄 Exploration mode: Random prediction');
        } else {
            prediction = finalProbOdd > finalProbEven ? 'odd' : 'even';
        }

        // Confidence smoothing
        this.smoothedConfidence = 0.7 * this.smoothedConfidence + 0.3 * rawConfidence;
        const confidence = this.smoothedConfidence;

        // Logging
        logger.analysis(`Analysis: Odds=${(finalProbOdd * 100).toFixed(1)}%, Evens=${(finalProbEven * 100).toFixed(1)}%, Conf=${(confidence * 100).toFixed(1)}%`);
        logger.analysis(`Metrics: Entropy=${entropy.toFixed(2)}, Vol=${volatility.toFixed(2)}, Streak=${streak.length}(${streak.type})`);
        logger.analysis(`Mode: ${this.currentMode.toUpperCase()}, Health: ${(this.reasoningHealth.lastHealthScore * 100).toFixed(0)}%, Consensus: ${(consensus.agreement * 100).toFixed(0)}%`);

        // Adaptive confidence threshold
        const adaptiveThreshold = this.getAdaptiveConfidenceThreshold(entropy);
        
        if (confidence < adaptiveThreshold) {
            logger.analysis(`Low confidence (${(confidence * 100).toFixed(1)}% < ${(adaptiveThreshold * 100).toFixed(1)}%). Skipping trade.`);
            this.isPending = false;
            return;
        }

        // Precision mode consensus check
        if (this.currentMode === 'precision' && !consensus.hasConsensus) {
            logger.analysis(`Precision mode: Insufficient consensus (${(consensus.agreement * 100).toFixed(0)}%). Skipping.`);
            this.isPending = false;
            return;
        }

        // Calculate stake
        const stake = this.calculateStake(volatility, entropy, confidence);
        
        logger.trade(`🎯 Prediction: ${prediction.toUpperCase()} | Confidence: ${(confidence * 100).toFixed(1)}% | Stake: $${stake}`);

        // Execute trade
        await this.executeTrade(prediction, stake, {
            state,
            deepState,
            confidence: rawConfidence,
            smoothedConfidence: confidence,
            entropy,
            volatility,
            streak: streak.length,
            modelPredictions,
            weights: adaptiveWeights,
            consensusAgreement: consensus.agreement
        });
    }

    // Continue with helper methods...
    // ========================================================================
    // MACHINE LEARNING ALGORITHMS
    // ========================================================================

    calculateStatisticalProbability(recent) {
        const oddCount = recent.filter(t => t.digit % 2 === 1).length;
        const evenCount = recent.length - oddCount;
        let oddProb = oddCount / recent.length;
        let evenProb = evenCount / recent.length;
        
        // Mean reversion bias
        const deviation = Math.abs(oddProb - 0.5);
        if (deviation > 0.15) {
            const reversionFactor = 0.1;
            oddProb += (oddProb < 0.5 ? reversionFactor : -reversionFactor);
            evenProb = 1 - oddProb;
        }
        
        return { oddProb, evenProb };
    }

    calculateMarkovProbabilities(history) {
        if (history.length < 3) {
            return { oddToOdd: 0.5, oddToEven: 0.5, evenToOdd: 0.5, evenToEven: 0.5 };
        }
        
        let transitions = { oddToOdd: 0, oddToEven: 0, evenToOdd: 0, evenToEven: 0 };
        let counts = { odd: 0, even: 0 };
        
        for (let i = 1; i < history.length; i++) {
            const prev = history[i - 1].digit % 2 === 1 ? 'odd' : 'even';
            const curr = history[i].digit % 2 === 1 ? 'odd' : 'even';
            counts[prev]++;
            transitions[`${prev}To${curr.charAt(0).toUpperCase() + curr.slice(1)}`]++;
        }
        
        return {
            oddToOdd: transitions.oddToOdd / (counts.odd || 1),
            oddToEven: transitions.oddToEven / (counts.odd || 1),
            evenToOdd: transitions.evenToOdd / (counts.even || 1),
            evenToEven: transitions.evenToEven / (counts.even || 1)
        };
    }

    calculateEMA(data, window, alpha = null) {
        if (data.length < window) return 0;
        if (!alpha) alpha = 2 / (window + 1);
        
        let ema = data[data.length - window].quote;
        for (let i = data.length - window + 1; i < data.length; i++) {
            ema = alpha * data[i].quote + (1 - alpha) * ema;
        }
        return ema;
    }

    calculateEMAs(data) {
        return {
            emaShort: this.calculateEMA(data, 10),
            emaLong: this.calculateEMA(data, 50)
        };
    }

    calculateVolatility(data, window) {
        if (data.length < window) return 0;
        
        const ema = this.calculateEMA(data, window);
        const variance = data.slice(-window).reduce((sum, tick, idx) => {
            const weight = Math.exp(-0.1 * (window - idx - 1));
            return sum + weight * Math.pow(tick.quote - ema, 2);
        }, 0) / window;
        
        return Math.sqrt(variance);
    }

    calculateStreak(history) {
        if (history.length < 2) return { length: 0, type: null, momentum: 0 };
        
        let length = 1;
        const lastType = history[history.length - 1].digit % 2 === 1 ? 'odd' : 'even';
        
        for (let i = history.length - 2; i >= 0; i--) {
            const currentType = history[i].digit % 2 === 1 ? 'odd' : 'even';
            if (currentType === lastType) {
                length++;
            } else {
                break;
            }
        }
        
        let momentum = 0;
        if (history.length >= 10) {
            const recent10 = history.slice(-10);
            const typeCount = recent10.filter(t => 
                (t.digit % 2 === 1 ? 'odd' : 'even') === lastType
            ).length;
            momentum = (typeCount / 10) - 0.5;
        }
        
        return { length, type: lastType, momentum };
    }

    calculateStreakAdjustments(streak) {
        let streakAdjustmentOdd = 0;
        let streakAdjustmentEven = 0;
        
        if (streak.length > 3) {
            const streakPenalty = Math.log(streak.length - 2) * 0.12;
            const momentumBonus = streak.momentum * 0.08;
            
            if (streak.type === 'odd') {
                streakAdjustmentOdd = -streakPenalty + momentumBonus;
                streakAdjustmentEven = streakPenalty - momentumBonus;
            } else {
                streakAdjustmentOdd = streakPenalty - momentumBonus;
                streakAdjustmentEven = -streakPenalty + momentumBonus;
            }
        }
        
        return { streakAdjustmentOdd, streakAdjustmentEven };
    }

    analyzePatterns(recent) {
        let patternProbOdd = 0.5;
        let patternProbEven = 0.5;
        
        if (recent.length >= 10 && this.patternMemory.length > 0) {
            const patternLength = 5;
            const current = recent.slice(-patternLength).map(t => t.digit % 2);
            
            let bestMatch = null;
            let bestSimilarity = 0;
            
            this.patternMemory.forEach(patternItem => {
                if (patternItem.sequence.length !== patternLength) return;
                
                let similarity = 0;
                for (let i = 0; i < patternLength; i++) {
                    if (patternItem.sequence[i] === current[i]) similarity++;
                }
                similarity /= patternLength;
                
                if (similarity > bestSimilarity && similarity >= 0.8) {
                    bestSimilarity = similarity;
                    bestMatch = patternItem;
                }
            });
            
            if (bestMatch) {
                const confidence = bestSimilarity * bestMatch.successRate;
                if (bestMatch.nextOutcome === 'odd') {
                    patternProbOdd = 0.5 + confidence * 0.3;
                    patternProbEven = 1 - patternProbOdd;
                } else {
                    patternProbEven = 0.5 + confidence * 0.3;
                    patternProbOdd = 1 - patternProbEven;
                }
                logger.analysis(`Pattern match: similarity ${(bestSimilarity * 100).toFixed(1)}%, success ${(bestMatch.successRate * 100).toFixed(1)}%`);
            }
        }
        
        return { patternProbOdd, patternProbEven };
    }

    calculateEntropy(history, window = 20) {
        if (history.length < window) return 0;
        
        const recent = history.slice(-window);
        const digitCounts = Array(10).fill(0);
        recent.forEach(t => digitCounts[t.digit]++);
        
        let entropy = 0;
        digitCounts.forEach(count => {
            if (count > 0) {
                const p = count / window;
                entropy -= p * Math.log2(p);
            }
        });
        
        return entropy / Math.log2(10);
    }

    calculateEntropyAdjustments(entropy, state) {
        let entropyAdjustmentOdd = 0;
        let entropyAdjustmentEven = 0;
        
        if (entropy > 0.9) {
            entropyAdjustmentOdd = state === 'odd' ? -0.05 : 0.05;
            entropyAdjustmentEven = state === 'even' ? -0.05 : 0.05;
        } else if (entropy < 0.7) {
            entropyAdjustmentOdd = state === 'odd' ? 0.08 : -0.08;
            entropyAdjustmentEven = state === 'even' ? 0.08 : -0.08;
        }
        
        return { entropyAdjustmentOdd, entropyAdjustmentEven };
    }

    detectCyclicPattern(history, maxPeriod = 10) {
        if (history.length < maxPeriod * 2) {
            return { hasCycle: false, period: 0, strength: 0 };
        }
        
        const sequence = history.slice(-maxPeriod * 3).map(t => t.digit % 2);
        let bestPeriod = 0;
        let bestScore = 0;
        
        for (let period = 2; period <= maxPeriod; period++) {
            let matches = 0;
            let total = 0;
            
            for (let i = period; i < sequence.length; i++) {
                if (sequence[i] === sequence[i - period]) matches++;
                total++;
            }
            
            const score = matches / total;
            if (score > bestScore) {
                bestScore = score;
                bestPeriod = period;
            }
        }
        
        return {
            hasCycle: bestScore > 0.65,
            period: bestPeriod,
            strength: bestScore
        };
    }

    analyzeCyclicPattern(cycleInfo, recent) {
        let cycleProbOdd = 0.5;
        let cycleProbEven = 0.5;
        
        if (cycleInfo.hasCycle && cycleInfo.strength > 0.7) {
            const cyclePrediction = recent[recent.length - cycleInfo.period].digit % 2 === 1 ? 'odd' : 'even';
            
            if (cyclePrediction === 'odd') {
                cycleProbOdd = 0.5 + cycleInfo.strength * 0.2;
                cycleProbEven = 1 - cycleProbOdd;
            } else {
                cycleProbEven = 0.5 + cycleInfo.strength * 0.2;
                cycleProbOdd = 1 - cycleProbEven;
            }
            
            logger.analysis(`Cyclic pattern: period ${cycleInfo.period}, strength ${(cycleInfo.strength * 100).toFixed(1)}%`);
        }
        
        return { cycleProbOdd, cycleProbEven };
    }

    getDeepState(volatility, trend, streak) {
        const volState = volatility < 0.3 ? 'low' : volatility < 0.7 ? 'medium' : 'high';
        const trendState = trend > 0.05 ? 'bullish' : trend < -0.05 ? 'bearish' : 'neutral';
        const streakState = streak < 3 ? 'short' : streak < 6 ? 'medium' : 'long';
        return `${volState}_${trendState}_${streakState}`;
    }

    getDeepQProbs(deepState) {
        let deepQProbOdd = 0.5;
        let deepQProbEven = 0.5;
        
        if (this.deepQTable[deepState]) {
            deepQProbOdd = this.deepQTable[deepState].odd;
            deepQProbEven = this.deepQTable[deepState].even;
        }
        
        return { deepQProbOdd, deepQProbEven };
    }

    getContextBias(volatility, entropy, streakLength) {
        let contextBias = 0;
        
        if (this.contextMemory.length >= 20) {
            let bestMatch = null;
            let bestSimilarity = 0;
            
            this.contextMemory.slice(-100).forEach(ctx => {
                const volDiff = Math.abs(ctx.volatility - volatility);
                const entDiff = Math.abs(ctx.entropy - entropy);
                const streakDiff = Math.abs(ctx.streak - streakLength);
                
                const similarity = 1 - (volDiff + entDiff + streakDiff * 0.1) / 3;
                
                if (similarity > bestSimilarity && similarity > 0.7) {
                    bestSimilarity = similarity;
                    bestMatch = ctx;
                }
            });
            
            if (bestMatch && bestMatch.result === 'win') {
                const contextWeight = 0.1 * bestSimilarity;
                contextBias = bestMatch.prediction === 'odd' ? contextWeight : -contextWeight;
                logger.analysis(`Context match: similarity ${(bestSimilarity * 100).toFixed(1)}%, prev: ${bestMatch.result}`);
            }
        }
        
        return contextBias;
    }

    bayesianFusion(modelProbs, modelWeights) {
        let posteriorOdd = 0.5;
        let posteriorEven = 0.5;
        
        Object.keys(modelProbs).forEach(model => {
            const weight = modelWeights[model] || 0.125;
            posteriorOdd += weight * modelProbs[model].odd;
            posteriorEven += weight * modelProbs[model].even;
        });
        
        const total = posteriorOdd + posteriorEven;
        return {
            odd: posteriorOdd / total,
            even: posteriorEven / total
        };
    }

    getAdaptiveWeights() {
        const weights = {};
        let totalAccuracy = 0;
        
        Object.keys(this.modelPerformance).forEach(model => {
            const perf = this.modelPerformance[model];
            const accuracy = perf.total > 0 ? perf.correct / perf.total : 0.5;
            weights[model] = Math.pow(accuracy, 2);
            totalAccuracy += weights[model];
        });
        
        // Normalize weights
        Object.keys(weights).forEach(model => {
            weights[model] = totalAccuracy > 0 ? weights[model] / totalAccuracy : 1 / Object.keys(weights).length;
            weights[model] = Math.max(0.05, weights[model]);
        });
        
        // Re-normalize after applying minimum
        totalAccuracy = Object.values(weights).reduce((sum, w) => sum + w, 0);
        Object.keys(weights).forEach(model => {
            weights[model] = weights[model] / totalAccuracy;
        });
        
        return weights;
    }

    checkModelConsensus(modelPredictions) {
        const predictions = Object.values(modelPredictions);
        const oddCount = predictions.filter(p => p === 'odd').length;
        const evenCount = predictions.filter(p => p === 'even').length;
        
        const agreement = Math.max(oddCount, evenCount) / predictions.length;
        const dominantPrediction = oddCount > evenCount ? 'odd' : 'even';
        
        return {
            agreement: agreement,
            prediction: dominantPrediction,
            hasConsensus: agreement >= 0.6
        };
    }

    // ========================================================================
    // ADAPTIVE LEARNING & REASONING
    // ========================================================================

    calculateReasoningHealth() {
        const recent20 = this.tradeHistory.slice(-20);
        if (recent20.length < 10) return 1.0;
        
        // Confidence variance
        const confidences = recent20.map(t => t.confidence);
        const avgConf = confidences.reduce((a, b) => a + b) / confidences.length;
        const variance = confidences.reduce((sum, c) => sum + Math.pow(c - avgConf, 2), 0) / confidences.length;
        
        // Win rate calculation
        let recentWins = 0;
        recent20.forEach(trade => {
            if (trade.profit !== undefined && trade.profit > 0) recentWins++;
        });
        const recentWinRate = recentWins / recent20.length;
        const winRateDrift = Math.abs(recentWinRate - 0.5);
        
        // Model disagreement
        const weightVariances = recent20.map(t => {
            if (!t.weights) return 0;
            const weights = Object.values(t.weights);
            const maxWeight = Math.max(...weights);
            const minWeight = Math.min(...weights);
            return maxWeight - minWeight;
        });
        const avgDisagreement = weightVariances.reduce((a, b) => a + b, 0) / weightVariances.length;
        
        // Health score (0-1, higher is better)
        const healthScore = Math.max(0.3, 
            1.0 - (variance * 2) - (winRateDrift * 1.5) - (avgDisagreement * 0.5)
        );
        
        this.reasoningHealth.lastHealthScore = healthScore;
        this.reasoningHealth.recentWinRate = recentWinRate;
        this.reasoningHealth.modelDisagreement = avgDisagreement;
        
        return healthScore;
    }

    getAdaptiveConfidenceThreshold(entropy) {
        const health = this.calculateReasoningHealth();
        let threshold = config.get('learning.baseConfidenceThreshold');
        
        if (health < 0.6) {
            threshold += 0.08;
            logger.analysis(`Low reasoning health (${(health * 100).toFixed(0)}%) - raising threshold to ${(threshold * 100).toFixed(1)}%`);
        } else if (health > 0.85) {
            threshold -= 0.03;
        }
        
        // Adjust based on recent entropy
        if (entropy > 0.9) {
            threshold += 0.05;
        }
        
        return Math.min(0.75, Math.max(0.52, threshold));
    }

    autoTuneLearningParameters() {
        const totalTrades = this.wins + this.losses;
        if (totalTrades < 10) return;
        
        const winRate = this.wins / totalTrades;
        const recentEntropy = this.tickHistory.length >= 50 ? 
            this.calculateEntropy(this.tickHistory, 50) : 0.8;
        
        // Adjust learning rate
        if (winRate < 0.45) {
            const baseLearningRate = config.get('learning.baseLearningRate');
            this.currentLearningRate = Math.min(baseLearningRate * 1.2, this.currentLearningRate * 1.05);
            logger.system(`Learning rate increased to ${this.currentLearningRate.toFixed(4)}`);
        } else if (winRate > 0.55) {
            const decay = config.get('learning.learningRateDecay');
            this.currentLearningRate = Math.max(0.01, this.currentLearningRate * decay);
        }
        
        // Mode switching based on entropy
        const previousMode = this.currentMode;
        
        if (recentEntropy > 0.9 && this.currentMode !== 'exploration') {
            this.currentMode = 'exploration';
        } else if (recentEntropy < 0.7 && this.currentMode !== 'precision') {
            this.currentMode = 'precision';
        } else if (recentEntropy >= 0.7 && recentEntropy <= 0.9 && this.currentMode !== 'balanced') {
            this.currentMode = 'balanced';
        }
        
        if (previousMode !== this.currentMode) {
            logger.system(`Mode switched: ${previousMode.toUpperCase()} → ${this.currentMode.toUpperCase()} (entropy: ${recentEntropy.toFixed(2)})`);
        }
    }

    validateTickData(newTick, previousTick) {
        if (!previousTick) return true;
        
        const priceChange = Math.abs(newTick.quote - previousTick.quote);
        const recentVolatility = this.tickHistory.length >= 20 ? 
            this.calculateVolatility(this.tickHistory, 20) : 1;
        
        const threshold = recentVolatility * 5;
        if (priceChange > threshold) {
            this.dataIntegrity.recentAnomalies++;
            this.dataIntegrity.score = Math.max(0.5, this.dataIntegrity.score * 0.95);
            logger.analysis(`Tick anomaly: price change ${priceChange.toFixed(4)} exceeds ${threshold.toFixed(4)}`);
            return false;
        }
        
        // Gradual recovery
        if (this.dataIntegrity.recentAnomalies > 0) {
            this.dataIntegrity.recentAnomalies = Math.max(0, this.dataIntegrity.recentAnomalies - 0.1);
            this.dataIntegrity.score = Math.min(1.0, this.dataIntegrity.score + 0.01);
        }
        
        return true;
    }

    shouldEnterCooldown() {
        if (this.consecutiveLosses < 3) return false;
        
        const recentEntropy = this.tickHistory.length >= 50 ? 
            this.calculateEntropy(this.tickHistory, 50) : 0.8;
        
        if (this.consecutiveLosses >= 3 && recentEntropy > 0.9) {
            const cooldownTicks = 5 + this.consecutiveLosses;
            logger.system(`Entering cooldown for ${cooldownTicks} ticks (losses: ${this.consecutiveLosses}, entropy: ${recentEntropy.toFixed(2)})`);
            this.nextTradeTime = Date.now() + (cooldownTicks * 2000);
            return true;
        }
        
        return false;
    }

    calculateStake(volatility, entropy, confidence) {
        const baseStake = config.baseStake;
        const martingaleMultiplier = config.get('trading.martingaleMultiplier');
        
        // Select strategy from meta-Q-table
        const recommendedStrategy = this.selectStrategy(volatility, entropy);
        let strategyMultiplier = 1.0;
        
        if (recommendedStrategy === 'conservative') {
            strategyMultiplier = 0.75;
            logger.analysis(`Meta-strategy: CONSERVATIVE (reducing stake by 25%)`);
        } else if (recommendedStrategy === 'aggressive' && confidence > 0.65) {
            strategyMultiplier = 1.25;
            logger.analysis(`Meta-strategy: AGGRESSIVE (increasing stake by 25%)`);
        }
        
        // Apply martingale with strategy modifier
        let stake = baseStake * Math.pow(martingaleMultiplier, this.consecutiveLosses) * strategyMultiplier;
        stake = Math.round(stake * 100) / 100; // Round to 2 decimals
        
        // Safety limit
        const maxStake = baseStake * 10;
        stake = Math.min(stake, maxStake);
        
        return stake;
    }

    selectStrategy(volatility, entropy) {
        const volState = volatility < 0.3 ? 'low' : volatility < 0.7 ? 'medium' : 'high';
        const entState = entropy < 0.7 ? 'low' : entropy < 0.9 ? 'medium' : 'high';
        const state = `${volState}_${entState}`;
        
        if (!this.metaQTable[state]) return 'balanced';
        
        const strategies = this.metaQTable[state];
        const bestStrategy = Object.keys(strategies).reduce((a, b) => 
            strategies[a] > strategies[b] ? a : b
        );
        
        return bestStrategy;
    }

    // ========================================================================
    // TRADE EXECUTION & LEARNING
    // ========================================================================

    async executeTrade(prediction, stake, tradeData) {
        const contractType = prediction === 'odd' ? 'DIGITODD' : 'DIGITEVEN';
        
        this.send({
            proposal: 1,
            amount: stake,
            basis: 'stake',
            contract_type: contractType,
            currency: 'USD',
            duration: config.duration,
            duration_unit: 't',
            symbol: config.symbol
        });
        
        // Store trade data
        this.tradeHistory.push({
            ...tradeData,
            prediction,
            stake,
            timestamp: Date.now(),
            consecutiveLosses: this.consecutiveLosses,
            mode: this.currentMode,
            healthScore: this.reasoningHealth.lastHealthScore,
            dataIntegrity: this.dataIntegrity.score
        });
        
        // Limit trade history size
        const maxTradeHistory = config.get('limits.maxTradeHistory');
        if (this.tradeHistory.length > maxTradeHistory) {
            this.tradeHistory = this.tradeHistory.slice(-maxTradeHistory);
        }
    }

    async processContractResult(profit) {
        const reward = profit > 0 ? 1 : -1;
        
        // Update statistics
        if (profit > 0) {
            this.wins++;
            this.consecutiveLosses = 0;
        } else {
            this.losses++;
            this.consecutiveLosses++;
        }
        
        const totalTrades = this.wins + this.losses;
        const winRate = (this.wins / totalTrades * 100).toFixed(1);
        
        logger.performance(`Stats: ${this.wins}W / ${this.losses}L | Win Rate: ${winRate}% | Streak: ${this.consecutiveLosses} losses`);
        
        // Get last trade data
        const lastTrade = this.tradeHistory[this.tradeHistory.length - 1];
        if (!lastTrade) return;
        
        // Store profit for analysis
        lastTrade.profit = profit;
        
        // Update Q-tables
        this.updateQTable(lastTrade.state, lastTrade.prediction, reward, lastTrade.deepState);
        
        // Update model performance
        if (lastTrade.modelPredictions) {
            this.updateModelPerformance(lastTrade.modelPredictions, lastTrade.prediction);
        }
        
        // Store context memory
        this.storeContext(lastTrade, profit > 0 ? 'win' : 'loss');
        
        // Update meta-Q-table
        const volState = lastTrade.volatility < 0.3 ? 'low' : lastTrade.volatility < 0.7 ? 'medium' : 'high';
        const entState = lastTrade.entropy < 0.7 ? 'low' : lastTrade.entropy < 0.9 ? 'medium' : 'high';
        this.updateMetaQTable(volState, entState, lastTrade.mode || 'balanced', reward);
        
        // Store pattern
        if (this.tickHistory.length >= 6) {
            const patternSeq = this.tickHistory.slice(-6, -1).map(t => t.digit % 2);
            this.storePattern(patternSeq, lastTrade.prediction, profit > 0);
        }
        
        // Periodic save
        if (totalTrades % 10 === 0) {
            await this.savePersistedData();
            logger.system(`Data saved (${totalTrades} trades completed)`);
        }
    }

    updateQTable(state, action, reward, deepState) {
        const discountFactor = config.get('learning.discountFactor');
        
        this.qTable[state][action] = this.qTable[state][action] + 
            this.currentLearningRate * (reward - this.qTable[state][action]);
        
        if (deepState && this.deepQTable[deepState]) {
            this.deepQTable[deepState][action] = this.deepQTable[deepState][action] + 
                this.currentLearningRate * (
                    reward + discountFactor * Math.max(
                        this.deepQTable[deepState].odd, 
                        this.deepQTable[deepState].even
                    ) - this.deepQTable[deepState][action]
                );
        }
        
        const decay = config.get('learning.learningRateDecay');
        this.currentLearningRate = Math.max(0.01, this.currentLearningRate * decay);
    }

    updateModelPerformance(predictions, actualOutcome) {
        Object.keys(predictions).forEach(model => {
            if (this.modelPerformance[model]) {
                this.modelPerformance[model].total++;
                if (predictions[model] === actualOutcome) {
                    this.modelPerformance[model].correct++;
                }
            }
        });
    }

    storeContext(trade, result) {
        this.contextMemory.push({
            volatility: trade.volatility,
            entropy: trade.entropy,
            streak: trade.streak,
            confidence: trade.confidence,
            prediction: trade.prediction,
            result: result,
            timestamp: trade.timestamp
        });
        
        const maxContextMemory = config.get('limits.maxContextMemory');
        if (this.contextMemory.length > maxContextMemory) {
            this.contextMemory = this.contextMemory.slice(-Math.floor(maxContextMemory * 0.6));
        }
    }

    updateMetaQTable(volatilityState, entropyState, strategy, reward) {
        const state = `${volatilityState}_${entropyState}`;
        if (!this.metaQTable[state]) return;
        
        const alpha = 0.1;
        const gamma = 0.9;
        
        const currentQ = this.metaQTable[state][strategy];
        const maxNextQ = Math.max(...Object.values(this.metaQTable[state]));
        
        this.metaQTable[state][strategy] = currentQ + alpha * (reward + gamma * maxNextQ - currentQ);
    }

    storePattern(sequence, outcome, wasCorrect) {
        const patternKey = sequence.join('');
        let existing = this.patternMemory.find(p => p.sequence.join('') === patternKey);
        
        if (existing) {
            existing.occurrences++;
            existing.successes += wasCorrect ? 1 : 0;
            existing.successRate = existing.successes / existing.occurrences;
            if (wasCorrect) existing.nextOutcome = outcome;
        } else {
            this.patternMemory.push({
                sequence: sequence,
                nextOutcome: outcome,
                occurrences: 1,
                successes: wasCorrect ? 1 : 0,
                successRate: wasCorrect ? 1 : 0
            });
        }
        
        const maxPatternMemory = config.get('limits.maxPatternMemory');
        if (this.patternMemory.length > maxPatternMemory) {
            this.patternMemory.sort((a, b) => 
                (b.successRate * b.occurrences) - (a.successRate * a.occurrences)
            );
            this.patternMemory = this.patternMemory.slice(0, maxPatternMemory);
        }
    }

    // ========================================================================
    // LOGGING & MONITORING
    // ========================================================================

    logPerformance() {
        const totalTrades = this.wins + this.losses;
        if (totalTrades === 0) return;
        
        const winRate = (this.wins / totalTrades * 100).toFixed(1);
        const runtime = Math.floor((Date.now() - this.startTime) / 1000 / 60);
        
        logger.performance('═══════════════════════════════════════');
        logger.performance(`⏱️  Runtime: ${runtime} minutes`);
        logger.performance(`📊 Trades: ${totalTrades} (${this.wins}W / ${this.losses}L)`);
        logger.performance(`📈 Win Rate: ${winRate}%`);
        logger.performance(`💰 Balance: $${this.balance.toFixed(2)}`);
        logger.performance(`🧠 Learning Rate: ${this.currentLearningRate.toFixed(4)}`);
        logger.performance(`💪 Health Score: ${(this.reasoningHealth.lastHealthScore * 100).toFixed(0)}%`);
        logger.performance(`🎯 Mode: ${this.currentMode.toUpperCase()}`);
        logger.performance('═══════════════════════════════════════');
        
        // Log model performance
        logger.performance('Model Accuracies:');
        Object.keys(this.modelPerformance).forEach(model => {
            const perf = this.modelPerformance[model];
            if (perf.total > 0) {
                const acc = (perf.correct / perf.total * 100).toFixed(1);
                logger.performance(`  ${model}: ${acc}% (${perf.correct}/${perf.total})`);
            }
        });
    }

    async logFinalStatistics() {
        const totalTrades = this.wins + this.losses;
        
        logger.system('═══════════════════════════════════════');
        logger.system('🏁 FINAL STATISTICS');
        logger.system('═══════════════════════════════════════');
        
        if (totalTrades > 0) {
            const winRate = (this.wins / totalTrades * 100).toFixed(1);
            const runtime = Math.floor((Date.now() - this.startTime) / 1000 / 60);
            
            logger.system(`⏱️  Total Runtime: ${runtime} minutes`);
            logger.system(`📊 Total Trades: ${totalTrades}`);
            logger.system(`✅ Wins: ${this.wins}`);
            logger.system(`❌ Losses: ${this.losses}`);
            logger.system(`📈 Win Rate: ${winRate}%`);
            logger.system(`💰 Final Balance: $${this.balance.toFixed(2)}`);
            logger.system(`🧠 Final Learning Rate: ${this.currentLearningRate.toFixed(4)}`);
            logger.system(`💪 Final Health: ${(this.reasoningHealth.lastHealthScore * 100).toFixed(0)}%`);
            logger.system(`📈 Data Integrity: ${(this.dataIntegrity.score * 100).toFixed(0)}%`);
            
            logger.system('───────────────────────────────────────');
            logger.system('📚 Learning Progress:');
            logger.system(`  Patterns Learned: ${this.patternMemory.length}`);
            logger.system(`  Contexts Stored: ${this.contextMemory.length}`);
            logger.system(`  Q-States: ${Object.keys(this.qTable).length}`);
            
            logger.system('───────────────────────────────────────');
            logger.system('🎯 Model Performance:');
            Object.keys(this.modelPerformance).forEach(model => {
                const perf = this.modelPerformance[model];
                if (perf.total > 0) {
                    const acc = (perf.correct / perf.total * 100).toFixed(1);
                    logger.system(`  ${model.toUpperCase()}: ${acc}% (${perf.correct}/${perf.total})`);
                }
            });
        }
        
        logger.system('═══════════════════════════════════════');
    }

    // ========================================================================
    // GRACEFUL SHUTDOWN
    // ========================================================================

    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            logger.system(`\n${signal} received. Shutting down gracefully...`);
            
            await this.stopBot();
            
            if (this.ws) {
                this.ws.close();
            }
            
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
            }
            
            logger.system('✅ Shutdown complete');
            process.exit(0);
        };
        
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGHUP', () => shutdown('SIGHUP'));
        
        process.on('uncaughtException', async (error) => {
            logger.error(`Uncaught Exception: ${error.message}`);
            logger.error(error.stack);
            await this.savePersistedData();
            process.exit(1);
        });
        
        process.on('unhandledRejection', async (reason, promise) => {
            logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
            await this.savePersistedData();
        });
    }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
    const bot = new DerivTradingBot();
    await bot.initialize();
}

// Run the bot
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = DerivTradingBot;
    