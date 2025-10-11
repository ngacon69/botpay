require('dotenv').config();

console.log('=== DEBUG BOT TOKEN ===');
console.log('Token exists:', !!process.env.BOTPAYOUT);
console.log('Token length:', process.env.BOTPAYOUT?.length);
console.log('Token preview:', process.env.BOTPAYOUT ? process.env.BOTPAYOUT.substring(0, 10) + '...' : 'MISSING');
console.log('=======================');

if (!process.env.BOTPAYOUT) {
    console.log('❌ ERROR: BOTPAYOUT token is missing in .env file');
    process.exit(1);
}

const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

client.on('ready', () => {
    console.log('✅ SUCCESS: Bot is online!');
    console.log(`✅ Logged in as: ${client.user.tag}`);
    process.exit(0);
});

client.on('error', (error) => {
    console.log('❌ Client error:', error.message);
});

// Set timeout to detect if bot doesn't connect
setTimeout(() => {
    console.log('❌ TIMEOUT: Bot failed to connect within 10 seconds');
    console.log('💡 Possible causes:');
    console.log('   - Invalid token');
    console.log('   - No internet connection');
    console.log('   - Bot not properly invited to server');
    process.exit(1);
}, 10000);

console.log('🔄 Attempting to login...');
client.login(process.env.BOTPAYOUT).catch(error => {
    console.log('❌ Login failed:', error.message);
    process.exit(1);
});