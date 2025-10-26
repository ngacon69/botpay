const { Client, GatewayIntentBits, Collection, REST, Routes, PermissionFlagsBits, ActivityType, EmbedBuilder, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { EventEmitter } = require('events');
require('dotenv').config();

// Enhanced configuration
const config = {
    prefix: '$',
    vouchChannelId: '1431929181054173214',
    mainInstanceId: "flf55",
    cooldowns: {
        stockAdd: 5000, // 5 seconds
        stockGen: 3000, // 3 seconds
        vouch: 60000   // 1 minute
    },
    permissions: {
        adminRoles: ['ADMIN_ROLE_ID_1', 'ADMIN_ROLE_ID_2'],
        modRoles: ['MOD_ROLE_ID_1', 'MOD_ROLE_ID_2']
    },
    database: {
        maxConnections: 20,
        idleTimeout: 30000,
        connectionTimeout: 60000
    }
};

// Advanced PostgreSQL connection with connection pooling
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
    max: config.database.maxConnections,
    idleTimeoutMillis: config.database.idleTimeout,
    connectionTimeoutMillis: config.database.connectionTimeout
});

// Enhanced database initialization with error handling and retry logic
class DatabaseManager {
    constructor(pool) {
        this.pool = pool;
        this.retryAttempts = 3;
        this.retryDelay = 5000;
    }

    async initialize() {
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                await this.createTables();
                await this.createIndexes();
                console.log('✅ Database initialized successfully');
                return true;
            } catch (error) {
                console.error(`❌ Database initialization attempt ${attempt} failed:`, error.message);
                
                if (attempt === this.retryAttempts) {
                    throw error;
                }
                
                console.log(`🔄 Retrying in ${this.retryDelay / 1000} seconds...`);
                await this.delay(this.retryDelay);
            }
        }
    }

    async createTables() {
        const tables = [
            `CREATE TABLE IF NOT EXISTS stocks (
                id SERIAL PRIMARY KEY,
                service VARCHAR(100) NOT NULL,
                email VARCHAR(255) NOT NULL,
                password VARCHAR(255) NOT NULL,
                added_by VARCHAR(100) NOT NULL,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status VARCHAR(20) DEFAULT 'active',
                last_used TIMESTAMP,
                used_by VARCHAR(100)
            )`,
            `CREATE TABLE IF NOT EXISTS commands_log (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL,
                user_tag VARCHAR(100) NOT NULL,
                command VARCHAR(50) NOT NULL,
                args TEXT,
                executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                success BOOLEAN DEFAULT true
            )`,
            `CREATE TABLE IF NOT EXISTS vouches (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL,
                user_tag VARCHAR(100) NOT NULL,
                message TEXT NOT NULL,
                vouch_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                verified BOOLEAN DEFAULT false
            )`
        ];

        for (const tableQuery of tables) {
            await this.pool.query(tableQuery);
        }
    }

    async createIndexes() {
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_stocks_service ON stocks(service)',
            'CREATE INDEX IF NOT EXISTS idx_stocks_status ON stocks(status)',
            'CREATE INDEX IF NOT EXISTS idx_commands_user ON commands_log(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_commands_time ON commands_log(executed_at)',
            'CREATE INDEX IF NOT EXISTS idx_vouches_user ON vouches(user_id)'
        ];

        for (const indexQuery of indexes) {
            await this.pool.query(indexQuery);
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Enhanced Client with optimized intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel, Partials.Message],
    presence: {
        activities: [{
            name: `Use ${config.prefix}help`,
            type: ActivityType.Watching
        }],
        status: 'online'
    }
});

// Enhanced collections and managers
client.prefixCommands = new Collection();
client.slashCommands = new Collection();
client.aliases = new Collection();
client.cooldowns = new Collection();
client.pool = pool;

// Advanced cooldown manager
class CooldownManager {
    constructor() {
        this.cooldowns = new Map();
    }

    set(userId, command, duration) {
        const key = `${userId}-${command}`;
        const expires = Date.now() + duration;
        this.cooldowns.set(key, expires);
        
        // Auto cleanup
        setTimeout(() => {
            if (this.cooldowns.get(key) === expires) {
                this.cooldowns.delete(key);
            }
        }, duration);
    }

    get(userId, command) {
        const key = `${userId}-${command}`;
        const expires = this.cooldowns.get(key);
        
        if (expires && Date.now() < expires) {
            return expires - Date.now();
        }
        
        return 0;
    }
}

// Enhanced command handler with logging
class CommandHandler extends EventEmitter {
    constructor(client) {
        super();
        this.client = client;
        this.cooldownManager = new CooldownManager();
    }

    async logCommand(userId, userTag, command, args, success = true) {
        try {
            await this.client.pool.query(
                'INSERT INTO commands_log (user_id, user_tag, command, args, success) VALUES ($1, $2, $3, $4, $5)',
                [userId, userTag, command, JSON.stringify(args), success]
            );
        } catch (error) {
            console.error('Failed to log command:', error);
        }
    }

    async handlePrefixCommand(message) {
        if (!message.content.startsWith(config.prefix) || message.author.bot) return;

        const args = message.content.slice(config.prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        // Check aliases
        const command = this.client.prefixCommands.get(commandName) || 
                       this.client.prefixCommands.get(this.client.aliases.get(commandName));

        if (!command) return;

        // Permission check
        if (command.permissions && !this.checkPermissions(message.member, command.permissions)) {
            return message.reply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true
            });
        }

        // Cooldown check
        const cooldownTime = this.cooldownManager.get(message.author.id, commandName);
        if (cooldownTime > 0) {
            return message.reply({
                content: `⏰ Please wait ${Math.ceil(cooldownTime / 1000)} seconds before using this command again.`,
                ephemeral: true
            });
        }

        // Set cooldown
        if (command.cooldown) {
            this.cooldownManager.set(message.author.id, commandName, command.cooldown);
        }

        try {
            await command.execute(message, args, this.client);
            await this.logCommand(message.author.id, message.author.tag, commandName, args, true);
        } catch (error) {
            console.error(`Error executing prefix command ${commandName}:`, error);
            await this.logCommand(message.author.id, message.author.tag, commandName, args, false);
            
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Command Error')
                .setDescription('An error occurred while executing this command.')
                .setTimestamp();

            if (message.replied || message.deferred) {
                await message.followUp({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await message.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }

    checkPermissions(member, requiredPermissions) {
        if (requiredPermissions.includes('ADMIN') && 
            !member.permissions.has(PermissionFlagsBits.Administrator)) {
            return false;
        }
        
        if (requiredPermissions.includes('MOD') && 
            !member.roles.cache.some(role => config.permissions.modRoles.includes(role.id))) {
            return false;
        }
        
        return true;
    }
}

// Initialize enhanced managers
const dbManager = new DatabaseManager(pool);
const commandHandler = new CommandHandler(client);

// Enhanced command loader with hot-reload capability
class CommandLoader {
    constructor(client) {
        this.client = client;
    }

    loadCommands() {
        this.loadPrefixCommands();
        this.loadSlashCommands();
    }

    loadPrefixCommands() {
        const commandsPath = path.join(__dirname, 'commandspefix');
        
        if (!fs.existsSync(commandsPath)) {
            fs.mkdirSync(commandsPath, { recursive: true });
            console.log('📁 Created commandspefix directory');
            return;
        }

        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        
        for (const file of commandFiles) {
            this.loadCommandFile(path.join(commandsPath, file), 'prefix');
        }
        
        console.log(`✅ Loaded ${this.client.prefixCommands.size} prefix commands`);
    }

    loadSlashCommands() {
        const commandsPath = path.join(__dirname, 'commands');
        
        if (!fs.existsSync(commandsPath)) {
            fs.mkdirSync(commandsPath, { recursive: true });
            console.log('📁 Created commands directory');
            return;
        }

        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        const slashCommands = [];
        
        for (const file of commandFiles) {
            const command = this.loadCommandFile(path.join(commandsPath, file), 'slash');
            if (command) slashCommands.push(command.data.toJSON());
        }

        this.registerSlashCommands(slashCommands);
        console.log(`✅ Loaded ${this.client.slashCommands.size} slash commands`);
    }

    loadCommandFile(filePath, type) {
        try {
            delete require.cache[require.resolve(filePath)];
            const command = require(filePath);
            
            if (!command.data || !command.execute) {
                console.log(`❌ Invalid ${type} command file: ${path.basename(filePath)}`);
                return null;
            }

            if (type === 'prefix') {
                this.client.prefixCommands.set(command.data.name, command);
                
                // Load aliases
                if (command.data.aliases) {
                    command.data.aliases.forEach(alias => {
                        this.client.aliases.set(alias, command.data.name);
                    });
                }
            } else {
                this.client.slashCommands.set(command.data.name, command);
            }

            return command;
        } catch (error) {
            console.log(`❌ Error loading ${type} command ${path.basename(filePath)}:`, error.message);
            return null;
        }
    }

    async registerSlashCommands(slashCommands) {
        if (slashCommands.length === 0) return;

        const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
        
        try {
            console.log('🔄 Registering slash commands...');
            
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: slashCommands }
            );
            
            console.log(`✅ Successfully registered ${slashCommands.length} slash commands!`);
        } catch (error) {
            console.error('❌ Error registering slash commands:', error);
        }
    }

    reloadCommand(commandName, type) {
        const commandsPath = path.join(__dirname, type === 'prefix' ? 'commandspefix' : 'commands');
        const filePath = path.join(commandsPath, `${commandName}.js`);
        
        if (!fs.existsSync(filePath)) {
            return false;
        }

        return this.loadCommandFile(filePath, type);
    }
}

const commandLoader = new CommandLoader(client);

// Enhanced vouch handler
class VouchManager {
    constructor(client) {
        this.client = client;
        this.pendingVouches = new Map();
    }

    async handleVouch(message) {
        if (message.channel.id !== config.vouchChannelId || 
            !message.content.toLowerCase().startsWith('+legit')) {
            return;
        }

        const botMention = message.mentions.users.has(this.client.user.id);
        const botNameInMessage = message.content.toLowerCase().includes(this.client.user.username.toLowerCase());
        
        if (!botMention && !botNameInMessage) {
            try {
                await message.reply({
                    content: `❌ Please mention the bot in your vouch! Example: \`+legit got account from ${this.client.user.username}\``,
                    ephemeral: true
                });
            } catch (error) {
                console.log('Could not send vouch error message');
            }
            return;
        }

        if (this.pendingVouches.has(message.author.id)) {
            await this.processVouch(message);
        }
    }

    async processVouch(message) {
        this.pendingVouches.delete(message.author.id);
        
        const emojis = ['🤑', '🔥', '✅', '👍', '💯'];
        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
        
        try {
            await message.react(randomEmoji);
            
            // Log vouch to database
            await this.client.pool.query(
                'INSERT INTO vouches (user_id, user_tag, message, verified) VALUES ($1, $2, $3, $4)',
                [message.author.id, message.author.tag, message.content, true]
            );
            
            // Send confirmation DM
            const confirmEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Vouch Received!')
                .setDescription(`Thank you for your vouch! ${randomEmoji}`)
                .addFields(
                    { name: 'Message', value: message.content.slice(0, 1024) },
                    { name: 'Channel', value: `<#${message.channel.id}>` }
                )
                .setTimestamp();

            await message.author.send({ embeds: [confirmEmbed] });
            
            console.log(`✅ Vouch completed for ${message.author.tag}`);
        } catch (error) {
            console.log('Could not process vouch:', error.message);
        }
    }

    setPendingVouch(userId) {
        this.pendingVouches.set(userId, Date.now());
        
        // Auto remove after 10 minutes
        setTimeout(() => {
            if (this.pendingVouches.has(userId)) {
                this.pendingVouches.delete(userId);
            }
        }, 600000);
    }
}

const vouchManager = new VouchManager(client);

// Bot event handlers
client.once('ready', async () => {
    try {
        await dbManager.initialize();
        
        console.log(`🤖 ${client.user.tag} is ready!`);
        console.log(`📊 Statistics:`);
        console.log(`   Prefix Commands: ${client.prefixCommands.size}`);
        console.log(`   Slash Commands: ${client.slashCommands.size}`);
        console.log(`   Aliases: ${client.aliases.size}`);
        console.log(`   Guilds: ${client.guilds.cache.size}`);
        console.log(`   Users: ${client.users.cache.size}`);
        
        // Update presence with stats
        client.user.setPresence({
            activities: [{
                name: `${client.prefixCommands.size} commands | ${config.prefix}help`,
                type: ActivityType.Watching
            }],
            status: 'online'
        });
    } catch (error) {
        console.error('❌ Failed to initialize bot:', error);
        process.exit(1);
    }
});

// Enhanced message handler
client.on('messageCreate', async (message) => {
    // Instance check for prefix commands
    if (process.env.INSTANCE_ID !== config.mainInstanceId) return;
    
    // Handle prefix commands
    await commandHandler.handlePrefixCommand(message);
    
    // Handle vouches
    await vouchManager.handleVouch(message);
});

// Enhanced interaction handler
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        await handleSlashCommand(interaction);
    } else if (interaction.isAutocomplete()) {
        await handleAutocomplete(interaction);
    }
});

async function handleSlashCommand(interaction) {
    const command = client.slashCommands.get(interaction.commandName);

    if (!command) {
        console.error(`❌ Slash command not found: ${interaction.commandName}`);
        return await interaction.reply({
            content: '❌ Command not found!',
            ephemeral: true
        });
    }

    try {
        await command.execute(interaction, client);
        await commandHandler.logCommand(
            interaction.user.id, 
            interaction.user.tag, 
            interaction.commandName, 
            interaction.options.data, 
            true
        );
    } catch (error) {
        console.error(`Error executing slash command /${interaction.commandName}:`, error);
        await commandHandler.logCommand(
            interaction.user.id, 
            interaction.user.tag, 
            interaction.commandName, 
            interaction.options.data, 
            false
        );

        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Command Error')
            .setDescription('An error occurred while executing this command.')
            .setTimestamp();

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
        } else {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
}

async function handleAutocomplete(interaction) {
    const command = client.slashCommands.get(interaction.commandName);
    
    if (!command || !command.autocomplete) return;
    
    try {
        await command.autocomplete(interaction);
    } catch (error) {
        console.error(`Error in autocomplete for /${interaction.commandName}:`, error);
    }
}

// Enhanced error handling
client.on('error', error => {
    console.error('🤖 Discord Client Error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Graceful shutdown
async function shutdown() {
    console.log('🛑 Shutting down bot gracefully...');
    
    try {
        // Close database connections
        await pool.end();
        
        // Destroy client
        client.destroy();
        
        console.log('✅ Bot shutdown complete');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Load commands and login
commandLoader.loadCommands();

client.login(process.env.TOKEN).catch(error => {
    console.error('❌ Failed to login:', error);
    process.exit(1);
});

// Export for testing and external access
module.exports = {
    client,
    config,
    pool,
    commandHandler,
    vouchManager,
    commandLoader
};
