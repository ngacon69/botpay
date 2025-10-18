const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Global variable to track autowarn status
let autowarnEnabled = false;
const restrictedChannels = [
    '1423687882375430291', 
    '1426143531595989034', 
    '1423687882375430292', 
    '1423687882375430293', 
    '1423687882375430295'
];

// Hàm khởi tạo database
async function initializeDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS warns (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL,
                user_name VARCHAR(100) NOT NULL,
                moderator_id VARCHAR(50) NOT NULL,
                moderator_name VARCHAR(100) NOT NULL,
                reason TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS event_bans (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL UNIQUE,
                user_name VARCHAR(100) NOT NULL,
                reason TEXT NOT NULL,
                banned_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('[✅] Database tables initialized');
    } catch (error) {
        console.error('[❌] Database initialization error:', error);
    }
}

// Gọi khởi tạo database
initializeDatabase();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autowarn')
        .setDescription('Toggle auto-warn system for -i in restricted channels')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ flags: 64 });

        autowarnEnabled = !autowarnEnabled;

        const embed = new EmbedBuilder()
            .setTitle(autowarnEnabled ? '✅ Auto-Warn Enabled' : '❌ Auto-Warn Disabled')
            .setColor(autowarnEnabled ? 0x2ECC71 : 0xE74C3C)
            .setDescription(`Auto-warn system is now **${autowarnEnabled ? 'ENABLED' : 'DISABLED'}**`)
            .addFields(
                { name: '📝 What it does', value: 'Automatically warns users who type `-i` in restricted channels', inline: false },
                { name: '🔒 Restricted Channels', value: restrictedChannels.map(id => `<#${id}>`).join(', '), inline: false }
            )
            .setFooter({ text: 'Auto-Warn System' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};

// Handle message events for auto-warn
module.exports.handleInteractions = (client) => {
    console.log('[🔧] Setting up autowarn interactions...');
    
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (!autowarnEnabled) return;
        if (!restrictedChannels.includes(message.channel.id)) return;
        
        // Check if message contains -i
        if (message.content.toLowerCase().includes('-i')) {
            try {
                const moderator = client.user;
                
                // Add warn to database
                await pool.query(
                    'INSERT INTO warns (user_id, user_name, moderator_id, moderator_name, reason, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
                    [message.author.id, message.author.tag, moderator.id, moderator.tag, 'Automatically warned for using -i in restricted channel']
                );

                // Get total warns
                const warnCount = await pool.query(
                    'SELECT COUNT(*) as count FROM warns WHERE user_id = $1',
                    [message.author.id]
                );

                const totalWarns = parseInt(warnCount.rows[0].count);

                // Delete the message
                await message.delete().catch(console.error);

                // Send warning message
                const warnEmbed = new EmbedBuilder()
                    .setTitle('⚠️ Auto-Warn Triggered')
                    .setColor(0xF39C12)
                    .setDescription(`${message.author}, you have been automatically warned for using \`-i\` in a restricted channel.`)
                    .addFields(
                        { name: '📊 Total Warns', value: `${totalWarns}`, inline: true },
                        { name: '📝 Reason', value: 'Using -i in restricted channel', inline: true }
                    )
                    .setFooter({ text: 'This is an automated warning' })
                    .setTimestamp();

                const warningMessage = await message.channel.send({ 
                    content: `${message.author}`,
                    embeds: [warnEmbed] 
                });

                // Delete warning message after 10 seconds
                setTimeout(() => {
                    warningMessage.delete().catch(console.error);
                }, 10000);

                // Check for punishments
                if (totalWarns >= 2) {
                    // Auto mute for 1 day
                    try {
                        const member = await message.guild.members.fetch(message.author.id);
                        await member.timeout(24 * 60 * 60 * 1000, `Auto-warn: Reached ${totalWarns} warnings`);
                        
                        const muteEmbed = new EmbedBuilder()
                            .setTitle('🔇 Auto-Mute Applied')
                            .setColor(0xE74C3C)
                            .setDescription(`${message.author} has been automatically muted for 1 day for reaching ${totalWarns} warnings.`)
                            .setTimestamp();

                        await message.channel.send({ embeds: [muteEmbed] });
                    } catch (error) {
                        console.log('Could not auto-mute user:', error.message);
                    }
                }

            } catch (error) {
                console.error('Error in auto-warn:', error);
            }
        }
    });
};