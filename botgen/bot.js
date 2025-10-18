const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Khởi tạo client Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Kết nối PostgreSQL database
const pool = new Pool({
    connectionString: 'postgresql://neondb_owner:npg_cL56QelHwXqf@ep-weathered-night-adfcxbnu-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    ssl: {
        rejectUnauthorized: false
    }
});

// Test database connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('Lỗi kết nối database:', err.stack);
    } else {
        console.log('✅ Đã kết nối PostgreSQL database');
        release();
    }
});

// Collection để lưu commands
client.commands = new Collection();

// Load commands từ thư mục commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`✅ Đã load command: ${command.data.name}`);
    } else {
        console.log(`⚠️ Command ${filePath} thiếu "data" hoặc "execute"`);
    }
}

// Sự kiện khi bot ready
client.once('ready', async () => {
    console.log(`✅ Bot ${client.user.tag} đã sẵn sàng!`);
    
    // Đăng ký commands với Discord
    try {
        const rest = new REST().setToken(process.env.BOTGEN);
        const commands = [];
        
        for (const file of commandFiles) {
            const command = require(path.join(commandsPath, file));
            if (command.data) {
                commands.push(command.data.toJSON());
            }
        }
        
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID_BOTGEN),
            { body: commands }
        );
        
        console.log(`✅ Đã đăng ký ${commands.length} commands`);
    } catch (error) {
        console.error('Lỗi đăng ký commands:', error);
    }
});

// Xử lý interactions (commands)
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`Không tìm thấy command: ${interaction.commandName}`);
        return;
    }

    try {
        await command.execute(interaction, pool);
    } catch (error) {
        console.error(`Lỗi khi chạy command ${interaction.commandName}:`, error);
        
        const errorMessage = { content: 'Có lỗi xảy ra khi thực thi command!', ephemeral: true };
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
});

// Xử lý lỗi
client.on('error', error => {
    console.error('Lỗi Discord client:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Đăng nhập bot
client.login(process.env.BOTGEN);