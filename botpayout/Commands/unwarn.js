const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unwarn')
        .setDescription('Remove a warning from a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to remove warning from')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('warn_id')
                .setDescription('ID of the warning to remove')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async execute(interaction) {
        await interaction.deferReply({ flags: 64 });

        const targetUser = interaction.options.getUser('user');
        const warnId = interaction.options.getInteger('warn_id');
        const moderator = interaction.user;

        try {
            let result;
            let action = '';

            if (warnId) {
                // Remove specific warning
                result = await pool.query(
                    'DELETE FROM warns WHERE id = $1 AND user_id = $2 RETURNING *',
                    [warnId, targetUser.id]
                );
                action = `Removed specific warning #${warnId}`;
            } else {
                // Remove latest warning
                result = await pool.query(
                    'DELETE FROM warns WHERE id = (SELECT id FROM warns WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1) RETURNING *',
                    [targetUser.id]
                );
                action = 'Removed latest warning';
            }

            if (result.rows.length === 0) {
                return await interaction.editReply({
                    content: '❌ No warning found to remove.'
                });
            }

            // Get remaining warns
            const warnCount = await pool.query(
                'SELECT COUNT(*) as count FROM warns WHERE user_id = $1',
                [targetUser.id]
            );

            const totalWarns = parseInt(warnCount.rows[0].count);
            const removedWarn = result.rows[0];

            const embed = new EmbedBuilder()
                .setTitle('✅ Warning Removed')
                .setColor(0x2ECC71)
                .addFields(
                    { name: '👤 User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
                    { name: '🛡️ Moderator', value: `${moderator.tag}`, inline: true },
                    { name: '📊 Remaining Warns', value: `${totalWarns}`, inline: true },
                    { name: '🗑️ Removed Warn ID', value: `#${removedWarn.id}`, inline: true },
                    { name: '📝 Reason', value: removedWarn.reason, inline: false },
                    { name: '🕒 Original Date', value: `<t:${Math.floor(new Date(removedWarn.created_at).getTime()/1000)}:R>`, inline: true }
                )
                .setFooter({ text: 'Warn System' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error removing warning:', error);
            await interaction.editReply({
                content: '❌ There was an error removing the warning.'
            });
        }
    },
};