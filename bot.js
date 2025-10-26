const { Client, GatewayIntentBits, Collection, REST, Routes, PermissionFlagsBits, Partials, ActivityType, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

// ---------- Config ----------
const config = {
    prefix: '$',
    vouchChannelId: '1431929181054173214',
    mainInstanceId: 'flf55', // instance chính
    cooldowns: {
        prefixCommand: 3000, // 3 giây cooldown
        vouch: 60000 // 1 phút
    }
};

// ---------- Database ----------
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_TtxZX2jLUoE3@ep-late-glitter-a4espvn0-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    ssl: {
        rejectUnauthorized: false
    }
});

async function initializeDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS stocks (
                id SERIAL PRIMARY KEY,
                service VARCHAR(50) NOT NULL,
                email VARCHAR(255) NOT NULL,
                password VARCHAR(255) NOT NULL,
                added_by VARCHAR(100) NOT NULL,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query('CREATE INDEX IF NOT EXISTS idx_service ON stocks(service)');

        console.log('✅ Database initialized successfully');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
    }
}

// ---------- Client ----------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.Message]
});

// ---------- Collections ----------
client.prefixCommands = new Collection();
client.slashCommands = new Collection();
client.userCooldowns = new Map(); // cooldown cho prefix command
client.pendingVouches = new Map();
client.pool = pool;

// ---------- Load Prefix Commands ----------
const prefixCommandsPath = path.join(__dirname, 'commandspefix');
if (fs.existsSync(prefixCommandsPath)) {
    const prefixCommandFiles = fs.readdirSync(prefixCommandsPath).filter(file => file.endsWith('.js'));

    for (const file of prefixCommandFiles) {
        const filePath = path.join(prefixCommandsPath, file);
        const command = require(filePath);

        if ('data' in command && 'execute' in command) {
            client.prefixCommands.set(command.data.name, command);
            console.log(`✅ Loaded prefix command: ${command.data.name}`);
        } else {
            console.log(`⚠️ Warning: Prefix command at ${filePath} is missing "data" or "execute"`);
        }
    }
} else {
    fs.mkdirSync(prefixCommandsPath);
    console.log('📁 commandspefix folder created');
}

// ---------- Load Slash Commands ----------
const slashCommandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(slashCommandsPath)) {
    const slashCommandFiles = fs.readdirSync(slashCommandsPath).filter(file => file.endsWith('.js'));
    const slashCommands = [];

    for (const file of slashCommandFiles) {
        const filePath = path.join(slashCommandsPath, file);
        const command = require(filePath);

        if ('data' in command && 'execute' in command) {
            client.slashCommands.set(command.data.name, command);
            slashCommands.push(command.data.toJSON());
            console.log(`✅ Loaded slash command: ${command.data.name}`);
        } else {
            console.log(`⚠️ Warning: Slash command at ${filePath} is missing "data" or "execute"`);
        }
    }

    // Register slash commands
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    (async () => {
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
    })();
} else {
    fs.mkdirSync(slashCommandsPath);
    console.log('📁 commands folder created');
}

// ---------- Helper Functions ----------
function checkCooldown(userId, type) {
    if (!client.userCooldowns.has(userId)) return 0;
    const userMap = client.userCooldowns.get(userId);
    if (!userMap[type]) return 0;
    const remaining = userMap[type] - Date.now();
    return remaining > 0 ? remaining : 0;
}

function setCooldown(userId, type, duration) {
    if (!client.userCooldowns.has(userId)) client.userCooldowns.set(userId, {});
    client.userCooldowns.get(userId)[type] = Date.now() + duration;
}

// ---------- Ready Event ----------
client.once('ready', async () => {
    await initializeDatabase();
    console.log(`🤖 ${client.user.tag} is ready!`);
    console.log(`📁 Loaded ${client.prefixCommands.size} prefix commands and ${client.slashCommands.size} slash commands`);
    client.user.setActivity(`${config.prefix}help | vouch system`, { type: ActivityType.Watching });
});

// ---------- Prefix Command Handler ----------
client.on('messageCreate', async message => {
    if (!message.content.startsWith(config.prefix) || message.author.bot) return;

    // Instance check (Render multi-instance)
    const INSTANCE_ID = process.env.INSTANCE_ID;
    if (INSTANCE_ID !== config.mainInstanceId) return;

    // Cooldown check
    const cooldown = checkCooldown(message.author.id, 'prefixCommand');
    if (cooldown > 0) {
        return message.reply(`⏰ Please wait ${Math.ceil(cooldown / 1000)} seconds before using another command.`);
    }

    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    const command = client.prefixCommands.get(commandName);

    if (!command) return;

    try {
        await command.execute(message, args, client);
        console.log(`🔧 Executed prefix command: $${commandName} by ${message.author.tag}`);
        setCooldown(message.author.id, 'prefixCommand', config.cooldowns.prefixCommand);
    } catch (error) {
        console.error(`❌ Error executing prefix command $${commandName}:`, error);
        await message.reply({ content: '❌ An error occurred while executing this command!' });
    }
});

// ---------- Slash Command Handler ----------
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const command = client.slashCommands.get(interaction.commandName);
    if (!command) {
        console.error(`❌ Slash command not found: ${interaction.commandName}`);
        return;
    }

    try {
        await command.execute(interaction, client);
        console.log(`🔧 Executed slash command: /${interaction.commandName} by ${interaction.user.tag}`);
    } catch (error) {
        console.error(`❌ Error executing slash command /${interaction.commandName}:`, error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: '❌ An error occurred while executing this command!', ephemeral: true });
        } else {
            await interaction.reply({ content: '❌ An error occurred while executing this command!', ephemeral: true });
        }
    }
});

// ---------- Vouch Handler ----------
client.on('messageCreate', async message => {
    if (message.channel.id !== config.vouchChannelId) return;
    if (!message.content.toLowerCase().startsWith('+legit')) return;

    const botMention = message.mentions.users.has(client.user.id);
    const botNameInMessage = message.content.toLowerCase().includes(client.user.username.toLowerCase());
    if (!botMention && !botNameInMessage) {
        await message.reply({ content: `❌ Please mention the bot in your vouch message! Example: \`+legit got account from ${client.user.username}\`` });
        return;
    }

    // Pending vouch check
    if (client.pendingVouches.has(message.author.id)) {
        const vouchInfo = client.pendingVouches.get(message.author.id);
        client.pendingVouches.delete(message.author.id);

        const emojis = ['🤑', '🔥', '✅', '👍', '💯'];
        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

        await message.react(randomEmoji);

        try {
            await message.author.send(`✅ Thank you for vouching! You can continue using our services. ${randomEmoji}`);
        } catch {
            console.log(`Could not send vouch DM to ${message.author.tag}`);
        }

        console.log(`✅ Vouch completed for ${message.author.tag}`);
    } else {
        await message.reply({ content: '❌ You do not have any pending vouches or you already vouched!' });
    }
});

// ---------- Error Handling ----------
client.on('error', console.error);
process.on('unhandledRejection', console.error);
process.on('uncaughtException', error => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// ---------- Login ----------
client.login(process.env.TOKEN);
