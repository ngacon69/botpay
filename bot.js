const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

console.log('🔧 Starting bot...');

// Kiểm tra env variables
if (!process.env.BOTPAYOUT) {
    console.log('❌ ERROR: BOTPAYOUT token not found in .env file');
    process.exit(1);
}

if (!process.env.CLIENT_ID) {
    console.log('❌ ERROR: CLIENT_ID not found in .env file');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();
client.tempStockData = {};

// Load commands
const commandsPath = path.join(__dirname, 'Commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log(`📁 Found ${commandFiles.length} command files`);

for (const file of commandFiles) {
    try {
        const command = require(path.join(commandsPath, file));
        if (command.data && command.execute) {
            client.commands.set(command.data.name, command);
            console.log(`[✅] Loaded command: ${command.data.name}`);
        }
    } catch (error) {
        console.log(`[❌] Error loading command ${file}:`, error.message);
    }
}

// Auto-deploy commands khi bot ready
client.once('ready', async () => {
    console.log(`\n✅ ${client.user.tag} is online!`);
    console.log(`📊 Serving ${client.guilds.cache.size} servers`);
    console.log(`🔧 Client ID: ${process.env.CLIENT_ID}`);
    
    // Deploy slash commands using CLIENT_ID
    try {
        console.log(`[🔄] Deploying ${client.commands.size} slash commands...`);
        
        const commands = [];
        client.commands.forEach(command => {
            commands.push(command.data.toJSON());
        });

        const rest = new REST({ version: '10' }).setToken(process.env.BOTPAYOUT);
        
        console.log(`[🔧] Deploying to application: ${process.env.CLIENT_ID}`);
        
        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );

        console.log(`[✅] Successfully deployed ${data.length} slash commands!`);
        console.log(`📝 Available commands:`);
        data.forEach(cmd => {
            console.log(`   - /${cmd.name} : ${cmd.description}`);
        });
        
    } catch (error) {
        console.log('[❌] Error deploying commands:', error);
    }

    // Load interaction handlers
    const interactionHandlers = [];
    for (const file of commandFiles) {
        try {
            const command = require(path.join(commandsPath, file));
            if (command.handleInteractions) {
                interactionHandlers.push(command);
                console.log(`[🔧] Setting up interactions for: ${command.data.name}`);
                command.handleInteractions(client);
            }
        } catch (error) {
            console.log(`[❌] Error loading interactions for ${file}:`, error.message);
        }
    }
    console.log(`[✅] Loaded ${interactionHandlers.length} interaction handlers`);
    
    // Set bot status
    client.user.setActivity('/panelpayout | /addstock', { type: 'WATCHING' });
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        console.log(`[🔧] Executing command: /${interaction.commandName} by ${interaction.user.tag}`);

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`[❌] Error executing /${interaction.commandName}:`, error);
            await interaction.reply({ 
                content: '❌ There was an error executing this command!', 
                ephemeral: true 
            });
        }
    }
});

// Xử lý lỗi
client.on('error', (error) => {
    console.log('❌ Client error:', error);
});

process.on('unhandledRejection', (error) => {
    console.log('❌ Unhandled rejection:', error);
});

// Kết nối bot
console.log('🔄 Connecting to Discord...');
client.login(process.env.BOTPAYOUT).catch(error => {
    console.log('❌ Failed to login:', error.message);
    process.exit(1);
});
// === KEEP ALIVE SERVER ===
const express = require('express');
const app = express();
const port = 3000;

// Simple route
app.get('/', (req, res) => {
    res.send(`<h2>✅ ${client.user?.tag || "Bot"} is running!</h2>`);
});

// Start the server
app.listen(port, () => {
    console.log(`🌐 Local web server running at http://localhost:${port}`);
});
