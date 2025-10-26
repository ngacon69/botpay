const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addstock')
        .setDescription('Add accounts to stock database')
        .addStringOption(option =>
            option.setName('service')
                .setDescription('Select service')
                .setRequired(true)
                .addChoices(
                    { name: 'Minecraft', value: 'minecraft' },
                    { name: 'Xbox Game Pass', value: 'xboxgp' },
                    { name: 'Xbox Ultimate', value: 'xboxul' },
                    { name: 'Unban', value: 'unban' }
                ))
        .addAttachmentOption(option =>
            option.setName('file')
                .setDescription('Upload TXT file with accounts (format: email:pass)')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction, client) {
        // Check if user is admin
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await interaction.reply({
                content: '❌ You do not have permission to use this command!',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const service = interaction.options.getString('service');
        const attachment = interaction.options.getAttachment('file');

        // Check if file is TXT
        if (!attachment.name.endsWith('.txt')) {
            return await interaction.editReply({
                content: '❌ Please upload a TXT file!',
                ephemeral: true
            });
        }

        try {
            // Download and parse the file
            const response = await fetch(attachment.url);
            const text = await response.text();
            const lines = text.split('\n').filter(line => line.trim() !== '');

            let validAccounts = 0;
            let invalidAccounts = 0;
            const addedAccounts = [];

            // Process each line
            for (const line of lines) {
                const [email, password] = line.split(':').map(part => part.trim());
                
                if (email && password && email.includes('@')) {
                    try {
                        // Insert into database
                        await client.pool.query(
                            'INSERT INTO stocks (service, email, password, added_by) VALUES ($1, $2, $3, $4)',
                            [service, email, password, interaction.user.tag]
                        );
                        validAccounts++;
                        addedAccounts.push(`${email}:${password}`);
                    } catch (error) {
                        console.error('Database insert error:', error);
                        invalidAccounts++;
                    }
                } else {
                    invalidAccounts++;
                }
            }

            // Create result file
            const resultContent = addedAccounts.join('\n');
            const buffer = Buffer.from(resultContent, 'utf-8');
            const resultFile = new AttachmentBuilder(buffer, { name: `added_${service}_accounts.txt` });

            await interaction.editReply({
                content: `✅ Successfully added **${validAccounts}** accounts to **${service}** stock!\n❌ Invalid/Skipped: ${invalidAccounts} accounts`,
                files: [resultFile],
                ephemeral: true
            });

        } catch (error) {
            console.error('Error processing file:', error);
            await interaction.editReply({
                content: '❌ An error occurred while processing the file!',
                ephemeral: true
            });
        }
    }
};