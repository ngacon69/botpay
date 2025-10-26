const { Client, GatewayIntentBits, Collection, REST, Routes, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

// Kiểm tra instance ID hiện tại trên Render
console.log("INSTANCE_ID:", process.env.INSTANCE_ID);

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_TtxZX2jLUoE3@ep-late-glitter-a4espvn0-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: {
    rejectUnauthorized: false
  }
});

// Create tables if not exists
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

// CHỈ SỬ DỤNG NHỮNG INTENTS THỰC SỰ CẦN THIẾT
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // QUAN TRỌNG: Đọc nội dung tin nhắn
        GatewayIntentBits.DirectMessages  // Gửi tin nhắn DM
    ]
});

client.prefixCommands = new Collection();
client.slashCommands = new Collection();
client.pool = pool;

// Store user cooldowns and vouch status globally
client.userCooldowns = new Map();
client.pendingVouches = new Map();

// Load Prefix Commands
const prefixCommandsPath = path.join(__dirname, 'commandspefix');
if (fs.existsSync(prefixCommandsPath)) {
    const prefixCommandFiles = fs.readdirSync(prefixCommandsPath).filter(file => file.endsWith('.js'));
    
    for (const file of prefixCommandFiles) {
        const filePath = path.join(prefixCommandsPath, file);
        try {
            const command = require(filePath);
            
            if (command.data && command.execute) {
                client.prefixCommands.set(command.data.name, command);
                console.log(`✅ Loaded prefix command: ${command.data.name}`);
            } else {
                console.log(`❌ Invalid command file: ${file} - missing data or execute`);
            }
        } catch (error) {
            console.log(`❌ Error loading command file ${file}:`, error.message);
        }
    }
} else {
    console.log('📁 commandspefix folder does not exist, creating...');
    fs.mkdirSync(prefixCommandsPath);
}

// Load Slash Commands
const slashCommandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(slashCommandsPath)) {
    const slashCommandFiles = fs.readdirSync(slashCommandsPath).filter(file => file.endsWith('.js'));
    const slashCommands = [];
    
    for (const file of slashCommandFiles) {
        const filePath = path.join(slashCommandsPath, file);
        try {
            const command = require(filePath);
            
            if (command.data && command.execute) {
                client.slashCommands.set(command.data.name, command);
                slashCommands.push(command.data.toJSON());
                console.log(`✅ Loaded slash command: ${command.data.name}`);
            } else {
                console.log(`❌ Invalid slash command file: ${file}`);
            }
        } catch (error) {
            console.log(`❌ Error loading slash command ${file}:`, error.message);
        }
    }
    
    // Register slash commands
    if (slashCommands.length > 0) {
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
    }
} else {
    console.log('📁 commands folder does not exist, creating...');
    fs.mkdirSync(slashCommandsPath);
}

// Bot ready event
client.once('ready', async () => {
    await initializeDatabase();
    console.log(`🤖 ${client.user.tag} is ready!`);
    console.log(`📁 Loaded ${client.prefixCommands.size} prefix commands and ${client.slashCommands.size} slash commands`);
    console.log(`🌐 Invite link: https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`);
});

// Prefix commands handler ($)
client.on('messageCreate', async message => {
    const INSTANCE_ID = process.env.INSTANCE_ID; // Render tự cấp

    // Chỉ cho instance chính gửi tin, ví dụ flf55
    if (INSTANCE_ID !== "flf55") return;

    if (!message.content.startsWith('$') || message.author.bot) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = client.prefixCommands.get(commandName);

    if (!command) return;

    try {
        await command.execute(message, args, client);
        console.log(`🔧 Executed prefix command: $${commandName} by ${message.author.tag}`);
    } catch (error) {
        console.error(`❌ Error executing prefix command $${commandName}:`, error);
        await message.reply({
            content: '❌ An error occurred while executing this command!',
            ephemeral: true
        });
    }
});


// Slash commands handler
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
        
        const errorMessage = { 
            content: '❌ An error occurred while executing this command!', 
            ephemeral: true 
        };
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
});

// Vouch message handler
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    
    // Check if message is in vouch channel and starts with +legit
    if (message.channel.id === '1431929181054173214' && message.content.toLowerCase().startsWith('+legit')) {
        
        const botMention = message.mentions.users.has(client.user.id);
        const botNameInMessage = message.content.toLowerCase().includes(client.user.username.toLowerCase());
        
        if (!botMention && !botNameInMessage) {
            try {
                await message.reply({
                    content: `❌ Please mention the bot in your vouch! Example: \`+legit got account from ${client.user.username}\``,
                    ephemeral: true
                });
            } catch (error) {
                console.log('Could not send vouch error message');
            }
            return;
        }

        if (client.pendingVouches.has(message.author.id)) {
            client.pendingVouches.delete(message.author.id);
            
            const emojis = ['🤑', '🔥'];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            
            try {
                await message.react(randomEmoji);
                await message.author.send(`✅ Thank you for vouching! ${randomEmoji}`);
            } catch (error) {
                console.log('Could not send vouch confirmation');
            }
            
            console.log(`✅ Vouch completed for ${message.author.tag}`);
        }
    }
});

// Error handling
client.on('error', error => {
    console.error('🤖 Discord Client Error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled Promise Rejection:', error);
});

// Login bot
client.login(process.env.TOKEN).catch(error => {
    console.error('❌ Failed to login:', error);
    process.exit(1);
});
