const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Initialize warns table
async function initializeWarnsTable() {
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
        `);
        console.log('[✅] Warns table initialized');
    } catch (error) {
        console.error('[❌] Warns table initialization error:', error);
    }
}

initializeWarnsTable();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to warn')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for warning')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async execute(interaction) {
        await interaction.deferReply({ flags: 64 });

        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const moderator = interaction.user;

        try {
            // Add warn to database
            await pool.query(
                'INSERT INTO warns (user_id, user_name, moderator_id, moderator_name, reason, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
                [targetUser.id, targetUser.tag, moderator.id, moderator.tag, reason]
            );

            // Get total warns
            const warnCount = await pool.query(
                'SELECT COUNT(*) as count FROM warns WHERE user_id = $1',
                [targetUser.id]
            );

            const totalWarns = parseInt(warnCount.rows[0].count);

            // Check for punishments
            let punishment = '';
            if (totalWarns >= 6) {
                punishment = '🔨 **PERMANENT BAN**';
                // Implement permanent ban logic here
            } else if (totalWarns >= 4) {
                punishment = '🚫 **BANNED FROM EVENTS**';
                // Implement event ban logic here
            } else if (totalWarns >= 2) {
                punishment = '🔇 **MUTED FOR 1 DAY**';
                // Implement 1-day mute logic here
                try {
                    const member = await interaction.guild.members.fetch(targetUser.id);
                    await member.timeout(24 * 60 * 60 * 1000, `Reached ${totalWarns} warnings`);
                } catch (error) {
                    console.log('Could not mute user:', error.message);
                }
            }

            const embed = new EmbedBuilder()
                .setTitle('⚠️ User Warned')
                .setColor(0xF39C12)
                .addFields(
                    { name: '👤 User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
                    { name: '🛡️ Moderator', value: `${moderator.tag}`, inline: true },
                    { name: '📊 Total Warns', value: `${totalWarns}`, inline: true },
                    { name: '📝 Reason', value: reason, inline: false }
                )
                .setFooter({ text: 'Warn System' })
                .setTimestamp();

            if (punishment) {
                embed.addFields({ name: '⚖️ Auto Punishment', value: punishment, inline: false });
                embed.setColor(0xE74C3C);
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error warning user:', error);
            await interaction.editReply({
                content: '❌ There was an error warning the user.'
            });
        }
    },
};