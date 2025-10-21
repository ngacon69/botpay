const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits } = require('discord.js');

const userRequests = new Map();
const payoutHistory = [];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panelpayout')
        .setDescription('Create an invite rewards payout panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        // Check if user has admin permissions (optional, because SlashCommandBuilder handles it)
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ You need administrator permissions to use this command.',
                ephemeral: true
            });
        }

        // Ask for embed color
        const colorModal = new ModalBuilder()
            .setCustomId('color_modal')
            .setTitle('Embed Color Configuration');

        const colorInput = new TextInputBuilder()
            .setCustomId('color_input')
            .setLabel('Enter embed color (hex code):')
            .setPlaceholder('#FF0000')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const firstActionRow = new ActionRowBuilder().addComponents(colorInput);
        colorModal.addComponents(firstActionRow);

        await interaction.showModal(colorModal);

        // Handle modal submission
        const filter = (modalInteraction) => modalInteraction.customId === 'color_modal';
        
        try {
            const modalResponse = await interaction.awaitModalSubmit({
                filter,
                time: 60000
            });

            const embedColor = modalResponse.fields.getTextInputValue('color_input');
            
            // Validate color format
            const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
            if (!hexColorRegex.test(embedColor)) {
                return modalResponse.reply({
                    content: '❌ Invalid color format! Please use hex format (e.g., #FF0000)',
                    ephemeral: true
                });
            }

            // Create the main embed
            const payoutEmbed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle('<a:diamond1:1430167258302255195> INVITE REWARDS <a:diamond1:1430167258302255195>')
                .setDescription('Claim your rewards based on your invite count! All rewards will be sent via DM.')
                .addFields(
                    {
                        name: '<a:Minecraft:1430164882736545934> Minecraft <a:Minecraft:1430164882736545934>',
                        value: '• 2 invites <a:Arrow:1430164794538856580> Minecraft Account (Non-Full Access)\n• 5 invites <a:Arrow:1430164794538856580> 3 Minecraft Accounts (Non-Full Access)',
                        inline: false
                    },
                    {
                        name: '<a:xbox_live:1430165930377351329> Xbox <a:xbox_live:1430165930377351329>',
                        value: '• 5 invites <a:Arrow:1430164794538856580> Xbox GamePass Account\n• 8 invites <a:Arrow:1430164794538856580> Xbox Ultimate Account',
                        inline: false
                    },
                    {
                        name: '<:method:1430165112626614283> Methods <:method:1430165112626614283>',
                        value: '• 1 invite <a:Arrow:1430164794538856580> Robux Method\n• 5 invites <a:Arrow:1430164794538856580> 1k Method (old but working)\n• 10 invites <a:Arrow:1430164794538856580> 3k Method (old but working)',
                        inline: false
                    }
                )
                .setFooter({ text: 'All rewards will be sent to your DMs. One active request per user.' })
                .setTimestamp();

            // Create claim button
            const claimButton = new ButtonBuilder()
                .setCustomId('claim_reward')
                .setLabel('Claim Reward')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎁');

            const buttonRow = new ActionRowBuilder().addComponents(claimButton);

            await modalResponse.reply({
                content: '✅ Payout panel created successfully!',
                ephemeral: true
            });

            // Send the main embed
            await interaction.channel.send({
                embeds: [payoutEmbed],
                components: [buttonRow]
            });

        } catch (error) {
            if (error.name === 'Error [InteractionCollectorError]') {
                await interaction.followUp({
                    content: '❌ Timeout! Please run the command again.',
                    ephemeral: true
                });
            } else {
                console.error('Error creating payout panel:', error);
                await interaction.followUp({
                    content: '❌ An error occurred while creating the payout panel.',
                    ephemeral: true
                });
            }
        }
    },

    // Handle button interactions
    async handleButton(interaction) {
        if (interaction.customId === 'claim_reward') {
            // Check if user already has an active request
            if (userRequests.has(interaction.user.id)) {
                return interaction.reply({
                    content: '❌ You already have an active payout request! Please complete your current request before claiming another reward.',
                    ephemeral: true
                });
            }

            // Create service selection menu
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('service_select')
                .setPlaceholder('Select your reward service')
                .addOptions([
                    {
                        label: 'Minecraft Account (2 invites)',
                        description: 'Non-Full Access Minecraft Account',
                        value: 'minecraft_2',
                        emoji: '1430164882736545934'
                    },
                    {
                        label: '3 Minecraft Accounts (5 invites)',
                        description: 'Three Non-Full Access Accounts',
                        value: 'minecraft_5',
                        emoji: '1430164882736545934'
                    },
                    {
                        label: 'Xbox GamePass (5 invites)',
                        description: 'Xbox GamePass Account',
                        value: 'xbox_gamepass',
                        emoji: '1430165930377351329'
                    },
                    {
                        label: 'Xbox Ultimate (8 invites)',
                        description: 'Xbox Ultimate Account',
                        value: 'xbox_ultimate',
                        emoji: '1430165930377351329'
                    },
                    {
                        label: 'Robux Method (1 invite)',
                        description: 'Robux Refund Method Guide',
                        value: 'robux_method',
                        emoji: '💰'
                    },
                    {
                        label: '1k Method (5 invites)',
                        description: 'Old but working 1k method',
                        value: '1k_method',
                        emoji: '1430165112626614283'
                    },
                    {
                        label: '3k Method (10 invites)',
                        description: 'Old but working 3k method',
                        value: '3k_method',
                        emoji: '1430165112626614283'
                    }
                ]);

            const selectRow = new ActionRowBuilder().addComponents(selectMenu);

            await interaction.reply({
                content: '🎯 **Please select the service you want to claim:**',
                components: [selectRow],
                ephemeral: true
            });
        }
    },

    // Handle select menu interactions
    async handleSelectMenu(interaction) {
        if (interaction.customId === 'service_select') {
            const selectedService = interaction.values[0];
            userRequests.set(interaction.user.id, selectedService);

            const serviceNames = {
                'minecraft_2': 'Minecraft Account (2 invites)',
                'minecraft_5': '3 Minecraft Accounts (5 invites)',
                'xbox_gamepass': 'Xbox GamePass Account (5 invites)',
                'xbox_ultimate': 'Xbox Ultimate Account (8 invites)',
                'robux_method': 'Robux Method (1 invite)',
                '1k_method': '1k Method (5 invites)',
                '3k_method': '3k Method (10 invites)'
            };

            // Handle method services that require ticket creation
            if (selectedService === '1k_method' || selectedService === '3k_method') {
                userRequests.delete(interaction.user.id); // Remove from active requests since ticket will be created
                
                const ticketChannelId = '1429770480323133471';
                
                const methodEmbed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('🎫 Ticket Required')
                    .setDescription(`To claim **${serviceNames[selectedService]}**, please create a ticket in <#${ticketChannelId}>`)
                    .addFields(
                        {
                            name: 'Next Steps:',
                            value: `1. Go to <#${ticketChannelId}>\n2. Create a new ticket\n3. Specify you want: **${serviceNames[selectedService]}**\n4. Our staff will assist you further.`,
                            inline: false
                        }
                    )
                    .setFooter({ text: 'Method services require ticket verification' })
                    .setTimestamp();

                await interaction.update({
                    embeds: [methodEmbed],
                    components: []
                });

                // Log the request
                this.logPayoutRequest(interaction.user, selectedService, 'TICKET_REQUIRED');
                return;
            }

            // For other services, send to payout channel
            const payoutChannelId = '1429777854425464872';
            const payoutChannel = interaction.client.channels.cache.get(payoutChannelId);

            if (!payoutChannel) {
                userRequests.delete(interaction.user.id);
                return interaction.update({
                    content: '❌ Payout channel not found! Please contact administration.',
                    components: [],
                    ephemeral: true
                });
            }

            // Create payout request embed
            const requestEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🎁 New Payout Request')
                .setDescription(`**User:** ${interaction.user.tag} (${interaction.user.id})\n**Service:** ${serviceNames[selectedService]}`)
                .addFields(
                    {
                        name: 'Status',
                        value: '🟡 Pending',
                        inline: true
                    },
                    {
                        name: 'Requested At',
                        value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                        inline: true
                    }
                )
                .setThumbnail(interaction.user.displayAvatarURL())
                .setFooter({ text: 'Payout Request System' })
                .setTimestamp();

            // Create approve button
            const approveButton = new ButtonBuilder()
                .setCustomId(`approve_${interaction.user.id}_${selectedService}`)
                .setLabel('Approve & Process')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅');

            const approveRow = new ActionRowBuilder().addComponents(approveButton);

            try {
                await payoutChannel.send({
                    content: `📬 New payout request from ${interaction.user}`,
                    embeds: [requestEmbed],
                    components: [approveRow]
                });

                await interaction.update({
                    content: `✅ Your request for **${serviceNames[selectedService]}** has been submitted to the payout team! You will receive your reward via DM once approved.`,
                    components: []
                });

                // Log the request
                this.logPayoutRequest(interaction.user, selectedService, 'SUBMITTED');

            } catch (error) {
                userRequests.delete(interaction.user.id);
                console.error('Error sending payout request:', error);
                await interaction.update({
                    content: '❌ Failed to submit your request. Please try again later.',
                    components: [],
                    ephemeral: true
                });
            }
        }
    },

    // Handle approve button from payout channel
    async handleApprove(interaction) {
        if (interaction.customId.startsWith('approve_')) {
            const [, userId, service] = interaction.customId.split('_');
            const user = await interaction.client.users.fetch(userId);

            const serviceNames = {
                'minecraft_2': 'Minecraft Account (2 invites)',
                'minecraft_5': '3 Minecraft Accounts (5 invites)',
                'xbox_gamepass': 'Xbox GamePass Account (5 invites)',
                'xbox_ultimate': 'Xbox Ultimate Account (8 invites)',
                'robux_method': 'Robux Method (1 invite)',
                '1k_method': '1k Method (5 invites)',
                '3k_method': '3k Method (10 invites)'
            };

            // Handle Robux method separately (no credentials needed)
            if (service === 'robux_method') {
                const robuxEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('💰 ROBUX METHOD GUIDE')
                    .setDescription('**Requirements:**\n- Apple or Android device\n- iTunes or Google Play money (Enough to buy any robux amount)')
                    .addFields(
                        {
                            name: 'Step-by-Step Instructions:',
                            value: `1. **Buy** the robux on your device.
2. **Spend** them before doing the next step.
3. Go to https://www.reportaproblem.apple.com/ (or report it on Google Play)
4. **Sign into** your account
5. Click on the bar and swipe in on "Request a refund"
6. **Put this specific reason** (or similar): "I need a refund because my 5 years old son was playing Roblox and he made this purchase by mistake." 
7. **Finish** the report
8. **Wait 6-48 hours** and you will get your money back.
9. Notice how what you purchased is still working, they will not delete it.
10. **Repeat** and you will have infinite robux.`,
                            inline: false
                        },
                        {
                            name: 'Important Notes:',
                            value: `• Do not overdo it, once or twice a week with different amounts.
• Using different VPN is even better.
• Other reasons like 'I did not receive the product' or 'I did not want to buy this' are NOT effective.`,
                            inline: false
                        }
                    )
                    .setFooter({ text: 'Method provided by payout system - Use responsibly' })
                    .setTimestamp();

                try {
                    // Send DM to user
                    await user.send({
                        content: '🎉 Your Robux Method has been approved! Here is your guide:',
                        embeds: [robuxEmbed]
                    });

                    // Update the request embed
                    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                        .setColor('#00FF00')
                        .spliceFields(0, 1, {
                            name: 'Status',
                            value: '🟢 Completed - Robux Guide Sent',
                            inline: true
                        });

                    await interaction.message.edit({
                        embeds: [updatedEmbed],
                        components: []
                    });

                    await interaction.reply({
                        content: `✅ Robux method guide sent to ${user.tag}`,
                        ephemeral: true
                    });

                    // Log completion
                    this.logPayoutRequest(user, service, 'COMPLETED');
                    userRequests.delete(userId);

                } catch (error) {
                    await interaction.reply({
                        content: `❌ Failed to send DM to ${user.tag}. They might have DMs disabled.`,
                        ephemeral: true
                    });
                }
                return;
            }

            // For other services, request credentials via modal
            const credentialsModal = new ModalBuilder()
                .setCustomId(`credentials_${userId}_${service}`)
                .setTitle('Enter Account Credentials');

            const emailInput = new TextInputBuilder()
                .setCustomId('email_input')
                .setLabel('Email:Password (Required Format)')
                .setPlaceholder('example@gmail.com:password123')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const modalRow = new ActionRowBuilder().addComponents(emailInput);
            credentialsModal.addComponents(modalRow);

            await interaction.showModal(credentialsModal);
        }
    },

    // Handle credentials modal submission
    async handleCredentialsModal(interaction) {
        if (interaction.customId.startsWith('credentials_')) {
            const [, userId, service] = interaction.customId.split('_');
            const user = await interaction.client.users.fetch(userId);
            const credentials = interaction.fields.getTextInputValue('email_input');

            // Validate format (basic email:pass format)
            if (!credentials.includes(':')) {
                return interaction.reply({
                    content: '❌ Invalid format! Please use email:password format.',
                    ephemeral: true
                });
            }

            const serviceNames = {
                'minecraft_2': 'Minecraft Account (2 invites)',
                'minecraft_5': '3 Minecraft Accounts (5 invites)',
                'xbox_gamepass': 'Xbox GamePass Account (5 invites)',
                'xbox_ultimate': 'Xbox Ultimate Account (8 invites)'
            };

            try {
                // Send credentials to user via DM
                const successEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('🎉 Your Reward is Ready!')
                    .setDescription(`Here are your credentials for **${serviceNames[service]}**:`)
                    .addFields(
                        {
                            name: 'Credentials',
                            value: `\`\`\`${credentials}\`\`\``,
                            inline: false
                        },
                        {
                            name: 'Important',
                            value: '• Change the password immediately\n• Do not share these credentials\n• Contact support if you have issues',
                            inline: false
                        }
                    )
                    .setFooter({ text: 'Enjoy your reward! Please vouch after receiving.' })
                    .setTimestamp();

                await user.send({
                    content: '✅ Your payout request has been approved!',
                    embeds: [successEmbed]
                });

                // Update the original request message
                const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor('#00FF00')
                    .spliceFields(0, 1, {
                        name: 'Status',
                        value: '🟢 Completed - Credentials Sent',
                        inline: true
                    });

                await interaction.message.edit({
                    embeds: [updatedEmbed],
                    components: []
                });

                await interaction.reply({
                    content: `✅ Credentials sent to ${user.tag}`,
                    ephemeral: true
                });

                // Log completion
                this.logPayoutRequest(user, service, 'COMPLETED');
                userRequests.delete(userId);

                // Send vouch reminder
                const vouchChannelId = '1429770477336793201';
                const vouchEmbed = new EmbedBuilder()
                    .setColor('#9B59B6')
                    .setTitle('📢 Vouch Reminder')
                    .setDescription(`Thank you for receiving **${serviceNames[service]}**! Please vouch in <#${vouchChannelId}> by typing:\n\n\`+legit\` - with or without a message\n\nAfter vouching, your message will be reacted with <a:LEGIT:1430177596259172504>`)
                    .setFooter({ text: 'Vouching helps our community grow!' })
                    .setTimestamp();

                await user.send({ embeds: [vouchEmbed] });

            } catch (error) {
                await interaction.reply({
                    content: `❌ Failed to send DM to ${user.tag}. They might have DMs disabled.`,
                    ephemeral: true
                });
            }
        }
    },

    // Log payout request to history channel
    async logPayoutRequest(user, service, status) {
        const historyChannelId = '1429770521104486433';
        const historyChannel = user.client.channels.cache.get(historyChannelId);
        
        if (!historyChannel) {
            console.error('History channel not found!');
            return;
        }

        const statusEmojis = {
            'SUBMITTED': '🟡',
            'TICKET_REQUIRED': '🎫',
            'COMPLETED': '🟢'
        };

        const logEmbed = new EmbedBuilder()
            .setColor(status === 'COMPLETED' ? '#00FF00' : '#FFA500')
            .setTitle('📋 Payout Request Log')
            .setDescription(`**User:** ${user.tag} (${user.id})\n**Service:** ${service}\n**Status:** ${statusEmojis[status]} ${status}`)
            .setThumbnail(user.displayAvatarURL())
            .setFooter({ text: `Payout System • ${new Date().toLocaleDateString()}` })
            .setTimestamp();

        try {
            await historyChannel.send({ embeds: [logEmbed] });
            payoutHistory.push({
                userId: user.id,
                service: service,
                status: status,
                timestamp: Date.now()
            });
        } catch (error) {
            console.error('Error logging payout request:', error);
        }
    },

    // Method to manage payout panel (stop/edit)
    async managePayoutPanel(interaction) {
        const managementChannelId = '1430178473925673031';
        
        if (interaction.channelId !== managementChannelId) {
            return;
        }

        // Implementation for panel management would go here
        // This would include stopping the panel, editing rewards, etc.
    }
};