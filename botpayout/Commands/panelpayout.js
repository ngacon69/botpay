const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const { Pool } = require('pg');

// Neon PostgreSQL Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_cL56QelHwXqf@ep-weathered-night-adfcxbnu-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    ssl: {
        rejectUnauthorized: false
    }
});

// Initialize database
async function initializeDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS stocks (
                id SERIAL PRIMARY KEY,
                service_type VARCHAR(100) NOT NULL,
                account_data TEXT NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            );
            
            CREATE TABLE IF NOT EXISTS payouts (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL,
                user_name VARCHAR(100) NOT NULL,
                reward_type VARCHAR(100) NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                vouch_message_id VARCHAR(50),
                created_at TIMESTAMP DEFAULT NOW(),
                expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '2 days')
            );

            CREATE TABLE IF NOT EXISTS vouch_submissions (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL,
                user_name VARCHAR(100) NOT NULL,
                vouch_content TEXT NOT NULL,
                payout_id INTEGER REFERENCES payouts(id),
                submitted_at TIMESTAMP DEFAULT NOW(),
                verified BOOLEAN DEFAULT FALSE
            );

            CREATE TABLE IF NOT EXISTS approval_requests (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL,
                user_name VARCHAR(100) NOT NULL,
                reward_type VARCHAR(100) NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                message_id VARCHAR(50),
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('[✅] Database initialized for payout system');
    } catch (error) {
        console.error('[❌] Database initialization error:', error);
    }
}

initializeDatabase();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panelpayout')
        .setDescription('Create a payout panel'),

    async execute(interaction) {
        if (!interaction.member.permissions.has('ADMINISTRATOR')) {
            return await interaction.reply({
                content: '❌ You need administrator permissions to use this command.',
                flags: 64
            });
        }

        // Create modal for panel setup
        const modal = new ModalBuilder()
            .setCustomId('payoutPanelModal')
            .setTitle('Create Payout Panel');

        const titleInput = new TextInputBuilder()
            .setCustomId('panelTitle')
            .setLabel('Panel Title')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter panel title...')
            .setMaxLength(100)
            .setRequired(true);

        const descriptionInput = new TextInputBuilder()
            .setCustomId('panelDescription')
            .setLabel('Panel Description')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Enter panel description...')
            .setMaxLength(1000)
            .setRequired(true);

        const firstActionRow = new ActionRowBuilder().addComponents(titleInput);
        const secondActionRow = new ActionRowBuilder().addComponents(descriptionInput);

        modal.addComponents(firstActionRow, secondActionRow);

        await interaction.showModal(modal);

        const filter = (interaction) => interaction.customId === 'payoutPanelModal';
        interaction.awaitModalSubmit({ filter, time: 60000 })
            .then(async (modalInteraction) => {
                const title = modalInteraction.fields.getTextInputValue('panelTitle');
                const description = modalInteraction.fields.getTextInputValue('panelDescription');

                const panelEmbed = new EmbedBuilder()
                    .setTitle(title)
                    .setDescription(description)
                    .setColor(0x00AE86)
                    .addFields(
                        {
                            name: '🎁 Available Rewards',
                            value: `**5 invites** = 1 Xbox GamePass Account\n**8 invites** = 1 Xbox Ultimate Account\n**4 invites** = Account Fan member\n**9 invites** = Account Mega Fan member\n**2 invites** = Minecraft Account (Non-Full Access)\n**5 invites** = Minecraft Account (Full Access)\n**7 invites** = Redeem Code Method\n**7 invites** = Robux Method\n**7 invites** = Ltc Method\n**7 invites** = Nitro Method`,
                            inline: false
                        },
                        {
                            name: '📋 How to Claim',
                            value: 'Click the **Reward** button below to request your payout. Your request will be reviewed by admin in <#1426228523160436929> before approval.',
                            inline: false
                        },
                        {
                            name: '⚠️ Important Notice',
                            value: 'After receiving your reward, you have **2 DAYS** to submit your vouch using `+vouch` in <#1423687881771319380>. Failure to do so will result in being **BANNED FROM FUTURE EVENTS**!',
                            inline: false
                        }
                    )
                    .setFooter({ text: 'Payout System • Admin approval required' })
                    .setTimestamp();

                const rewardButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('startPayout')
                            .setLabel('🎁 Request Reward')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('🎁')
                    );

                await modalInteraction.reply({
                    content: '✅ Payout panel created successfully!',
                    flags: 64
                });

                // Send the panel to the channel
                await modalInteraction.channel.send({
                    embeds: [panelEmbed],
                    components: [rewardButton]
                });
            })
            .catch(console.error);
    },
};

// Handle interactions - FIXED VERSION
module.exports.handleInteractions = (client) => {
    console.log('[🔧] Setting up panelpayout interactions...');
    
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

        console.log(`[🔧] Interaction received: ${interaction.customId}`);

        try {
            if (interaction.customId === 'startPayout') {
                await handlePayoutStart(interaction);
            } else if (interaction.customId === 'submitWorking') {
                await handleWorkingSubmit(interaction);
            } else if (interaction.customId === 'serviceSelect') {
                await handleRewardSelection(interaction);
            } else if (interaction.customId === 'approve_payout') {
                await handleApprovePayout(interaction);
            } else if (interaction.customId === 'deny_payout') {
                await handleDenyPayout(interaction);
            }
        } catch (error) {
            console.error('[❌] Interaction error:', error);
            if (interaction.isStringSelectMenu() && !interaction.replied) {
                await interaction.reply({
                    content: '❌ There was an error processing your request.',
                    flags: 64
                });
            }
        }
    });

    // Handle +vouch command in vouch channel
    client.on('messageCreate', async (message) => {
        if (message.channel.id !== '1423687881771319380') return;
        if (message.author.bot) return;
        
        if (message.content.startsWith('+vouch')) {
            await handleVouchCommand(message);
        }
    });
};

// Handle +vouch command - FIXED VERSION
async function handleVouchCommand(message) {
    try {
        const vouchContent = message.content.replace('+vouch', '').trim();
        
        if (!vouchContent) {
            await message.reply('❌ Please provide your vouch content. Example: `+vouch Working perfectly!`');
            return;
        }

        // Check if user has recent payout
        const payoutResult = await pool.query(
            'SELECT * FROM payouts WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1',
            [message.author.id, 'delivered']
        );

        if (payoutResult.rows.length === 0) {
            await message.reply('❌ You dont have any recent payouts to vouch for.');
            return;
        }

        const payout = payoutResult.rows[0];

        // Check if already vouched
        const vouchCheck = await pool.query(
            'SELECT * FROM vouch_submissions WHERE user_id = $1 AND payout_id = $2',
            [message.author.id, payout.id]
        );

        if (vouchCheck.rows.length > 0) {
            await message.reply('❌ You have already submitted a vouch for this payout.');
            return;
        }

        // Record vouch submission
        await pool.query(
            'INSERT INTO vouch_submissions (user_id, user_name, vouch_content, payout_id) VALUES ($1, $2, $3, $4)',
            [message.author.id, message.author.tag, vouchContent, payout.id]
        );

        // Add ✅ reaction instead of legit emoji
        await message.react('✅');

        // Send confirmation to payout channel
        const payoutChannel = await message.client.channels.fetch('1423687884187111537');
        const vouchEmbed = new EmbedBuilder()
            .setTitle('✅ Vouch Submitted Successfully')
            .setColor(0x2ECC71)
            .addFields(
                { name: 'User', value: `${message.author.tag} (${message.author.id})`, inline: true },
                { name: 'Reward', value: payout.reward_type, inline: true },
                { name: 'Vouch Content', value: vouchContent.substring(0, 1000), inline: false }
            )
            .setFooter({ text: 'Vouch verified with ✅ emoji' })
            .setTimestamp();

        await payoutChannel.send({ embeds: [vouchEmbed] });

        await message.reply('✅ Thank you for your vouch! Your submission has been recorded.');

    } catch (error) {
        console.error('Error handling vouch:', error);
        await message.reply('❌ There was an error processing your vouch. Please try again.');
    }
}

// Handle payout start
async function handlePayoutStart(interaction) {
    // Create reward selection embed
    const rewardEmbed = new EmbedBuilder()
        .setTitle('🎁 Select Your Reward')
        .setDescription('Please choose the reward you want to claim based on your invite count:')
        .setColor(0x3498DB)
        .addFields(
            {
                name: 'Game Accounts',
                value: '• Xbox GamePass (5 invites)\n• Xbox Ultimate (8 invites)\n• Fan Member (4 invites)\n• Mega Fan (9 invites)\n• Minecraft Non-Full (2 invites)\n• Minecraft Full (5 invites)',
                inline: true
            },
            {
                name: 'Methods',
                value: '• Redeem Code (7 invites)\n• Robux (7 invites)\n• LTC (7 invites)\n• Nitro (7 invites)',
                inline: true
            }
        )
        .setFooter({ text: 'Your request will be reviewed by admin' });

    // Create reward selection dropdown
    const serviceSelect = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('serviceSelect')
                .setPlaceholder('Select your reward type')
                .addOptions([
                    {
                        label: 'Xbox GamePass',
                        description: '5 invites = 1 Xbox GamePass Account',
                        value: 'xbox_gamepass'
                    },
                    {
                        label: 'Xbox Ultimate',
                        description: '8 invites = 1 Xbox Ultimate Account',
                        value: 'xbox_ultimate'
                    },
                    {
                        label: 'Fan Member',
                        description: '4 invites = Account Fan member',
                        value: 'fan_member'
                    },
                    {
                        label: 'Mega Fan',
                        description: '9 invites = Account Mega Fan member',
                        value: 'mega_fan'
                    },
                    {
                        label: 'Minecraft Non-Full',
                        description: '2 invites = Minecraft Non-Full Access',
                        value: 'minecraft_nonfull'
                    },
                    {
                        label: 'Minecraft Full',
                        description: '5 invites = Minecraft Full Access',
                        value: 'minecraft_full'
                    },
                    {
                        label: 'Redeem Code Method',
                        description: '7 invites = Redeem Code Method',
                        value: 'redeem_code'
                    },
                    {
                        label: 'Robux Method',
                        description: '7 invites = Robux Method',
                        value: 'robux'
                    },
                    {
                        label: 'LTC Method',
                        description: '7 invites = Ltc Method',
                        value: 'ltc'
                    },
                    {
                        label: 'Nitro Method',
                        description: '7 invites = Nitro Method',
                        value: 'nitro'
                    }
                ])
        );

    await interaction.reply({
        embeds: [rewardEmbed],
        components: [serviceSelect],
        flags: 64
    });
}

// Handle reward selection - FIXED VERSION
async function handleRewardSelection(interaction) {
    // DEFER REPLY trước khi xử lý
    await interaction.deferReply({ flags: 64 });
    
    const rewardType = interaction.values[0];
    const rewardNames = {
        'xbox_gamepass': 'Xbox GamePass Account',
        'xbox_ultimate': 'Xbox Ultimate Account',
        'fan_member': 'Fan Member Account',
        'mega_fan': 'Mega Fan Account',
        'minecraft_nonfull': 'Minecraft Account (Non-Full Access)',
        'minecraft_full': 'Minecraft Account (Full Access)',
        'redeem_code': 'Redeem Code Method',
        'robux': 'Robux Method',
        'ltc': 'LTC Method',
        'nitro': 'Nitro Method'
    };

    const rewardName = rewardNames[rewardType] || 'Unknown Reward';

    try {
        // Send approval request to admin channel - WITH ERROR HANDLING
        let approvalChannel;
        try {
            approvalChannel = await interaction.client.channels.fetch('1426228523160436929');
        } catch (channelError) {
            console.log('[❌] Approval channel not found, using current channel');
            approvalChannel = interaction.channel;
        }
        
        const approvalEmbed = new EmbedBuilder()
            .setTitle('🔄 Payout Approval Request')
            .setDescription(`User **${interaction.user}** is requesting a reward payout.`)
            .setColor(0xF39C12)
            .addFields(
                { name: '👤 User', value: `${interaction.user.tag}\n(${interaction.user.id})`, inline: true },
                { name: '🎁 Reward', value: rewardName, inline: true },
                { name: '📅 Requested', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true },
                { name: '🔍 User Info', value: `Joined: <t:${Math.floor(interaction.member.joinedTimestamp/1000)}:D>\nRoles: ${interaction.member.roles.cache.size - 1}`, inline: false }
            )
            .setFooter({ text: 'Payout Approval System' })
            .setTimestamp();

        const approvalButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('approve_payout')
                    .setLabel('✅ Approve')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅'),
                new ButtonBuilder()
                    .setCustomId('deny_payout')
                    .setLabel('❌ Deny')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌')
            );

        const approvalMessage = await approvalChannel.send({
            content: '📢 New payout request!',
            embeds: [approvalEmbed],
            components: [approvalButtons]
        });

        // Store request in database
        await pool.query(
            'INSERT INTO approval_requests (user_id, user_name, reward_type, message_id) VALUES ($1, $2, $3, $4)',
            [interaction.user.id, interaction.user.tag, rewardType, approvalMessage.id]
        );

        // Confirm to user
        const userEmbed = new EmbedBuilder()
            .setTitle('✅ Request Submitted')
            .setDescription(`Your request for **${rewardName}** has been sent to admin for approval.\n\nPlease wait for review in <#1426228523160436929>.`)
            .setColor(0x3498DB)
            .setFooter({ text: 'You will be notified when approved' })
            .setTimestamp();

        await interaction.editReply({
            embeds: [userEmbed],
            components: []
        });

    } catch (error) {
        console.error('Error in reward selection:', error);
        await interaction.editReply({
            content: '❌ There was an error processing your request. Please try again.',
            components: []
        });
    }
}

// Handle approve payout
async function handleApprovePayout(interaction) {
    if (!interaction.member.permissions.has('ADMINISTRATOR')) {
        return await interaction.reply({
            content: '❌ You need administrator permissions to approve payouts.',
            flags: 64
        });
    }

    const embed = interaction.message.embeds[0];
    const userField = embed.fields.find(f => f.name === '👤 User');
    const userId = userField.value.match(/\((\d+)\)/)[1];
    const user = await interaction.client.users.fetch(userId);
    
    const rewardField = embed.fields.find(f => f.name === '🎁 Reward');
    const rewardName = rewardField.value;

    // Update approval message
    const approvedEmbed = EmbedBuilder.from(embed)
        .setTitle('✅ Payout Approved')
        .setColor(0x2ECC71)
        .addFields(
            { name: '✅ Approved by', value: `${interaction.user.tag}`, inline: true },
            { name: '🕒 Approved at', value: `<t:${Math.floor(Date.now()/1000)}:T>`, inline: true }
        );

    await interaction.message.edit({
        embeds: [approvedEmbed],
        components: []
    });

    // Send loading embed to payout channel
    const payoutChannel = await interaction.client.channels.fetch('1423687884187111537');
    
    const loadingEmbed = new EmbedBuilder()
        .setTitle('🔄 Processing Approved Payout')
        .setDescription(`Processing payout for **${rewardName}** for user ${user}`)
        .setColor(0xF39C12)
        .addFields(
            { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
            { name: 'Reward', value: rewardName, inline: true },
            { name: 'Status', value: 'Approved - Processing...', inline: true },
            { name: 'Approved by', value: interaction.user.tag, inline: true }
        )
        .setTimestamp();

    const loadingMessage = await payoutChannel.send({ embeds: [loadingEmbed] });

    // Get reward type from database
    const requestResult = await pool.query(
        'SELECT * FROM approval_requests WHERE message_id = $1',
        [interaction.message.id]
    );

    if (requestResult.rows.length > 0) {
        const request = requestResult.rows[0];
        const rewardType = request.reward_type;

        // Check if it's a method (instant delivery)
        const instantMethods = ['redeem_code', 'robux', 'ltc', 'nitro'];
        
        if (instantMethods.includes(rewardType)) {
            await deliverMethod(user, rewardType, rewardName, loadingMessage, interaction);
        } else {
            await deliverAccount(user, rewardType, rewardName, loadingMessage, interaction);
        }

        // Update request status
        await pool.query(
            'UPDATE approval_requests SET status = $1 WHERE message_id = $2',
            ['approved', interaction.message.id]
        );
    }

    await interaction.reply({
        content: '✅ Payout approved and processing started!',
        flags: 64
    });
}

// Handle deny payout
async function handleDenyPayout(interaction) {
    if (!interaction.member.permissions.has('ADMINISTRATOR')) {
        return await interaction.reply({
            content: '❌ You need administrator permissions to deny payouts.',
            flags: 64
        });
    }

    const embed = interaction.message.embeds[0];
    const userField = embed.fields.find(f => f.name === '👤 User');
    const userId = userField.value.match(/\((\d+)\)/)[1];
    const user = await interaction.client.users.fetch(userId);

    // Update approval message
    const deniedEmbed = EmbedBuilder.from(embed)
        .setTitle('❌ Payout Denied')
        .setColor(0xE74C3C)
        .addFields(
            { name: '❌ Denied by', value: `${interaction.user.tag}`, inline: true },
            { name: '🕒 Denied at', value: `<t:${Math.floor(Date.now()/1000)}:T>`, inline: true }
        );

    await interaction.message.edit({
        embeds: [deniedEmbed],
        components: []
    });

    // Notify user via DM
    try {
        const denyEmbed = new EmbedBuilder()
            .setTitle('❌ Payout Request Denied')
            .setDescription('Your payout request has been denied by admin.')
            .setColor(0xE74C3C)
            .addFields(
                { name: 'Reason', value: 'Contact admin for more information.', inline: false },
                { name: 'Denied by', value: interaction.user.tag, inline: true }
            )
            .setTimestamp();

        await user.send({ embeds: [denyEmbed] });
    } catch (error) {
        console.log('Could not DM user about denial');
    }

    // Update request status
    await pool.query(
        'UPDATE approval_requests SET status = $1 WHERE message_id = $2',
        ['denied', interaction.message.id]
    );

    await interaction.reply({
        content: '❌ Payout denied and user notified.',
        flags: 64
    });
}

// Deliver method instantly - FIXED VERSION
async function deliverMethod(user, rewardType, rewardName, loadingMessage, interaction) {
    const methodContents = {
        'nitro': `**<a:nitro:1417164913985454162> Nitro Boost/Basic GiftLink Method <a:nitro:1417164913985454162>** \n||First login to this website With the link below \nLink:-https://chequity.io/r/F1D5CD88\nThen after this you can GO to the autoearn section\nFor mobile do the tasks and challanges and earn coins { Mobile }\nYou should Join their discord for coupon drops and more to get more coins\nFinally go to Withdraw and Withdraw Robux GiftCard Code||`,
        
        'robux': `**Here Is Your Robux Method! <:robux:1417165332556152922>** \n||First login to this website With the link below \nLink:-https://chequity.io/r/F1D5CD88\nThen after this you can GO to the autoearn section\nFor mobile do the tasks and challanges and earn coins { Mobile }\nYou should Join their discord for coupon drops and more to get more coins\nFinally go to Withdraw and Withdraw Robux GiftCard Code||`,
        
        'ltc': `**Ltc Method <a:LTC:1404007243220779092>** \n||First login to this website With the link below \nLink:-https://chequity.io/r/F1D5CD88\nThen after this you can GO to the autoearn section\nFor mobile do the tasks and challanges and earn coins { Mobile }\nYou should Join their discord for coupon drops and more to get more coins\nFinally go to Withdraw and Withdraw Ltc||`,
        
        'redeem_code': `**Redeem Code Method** \n||First login to this website With the link below \nLink:-https://chequity.io/r/F1D5CD88\nThen after this you can GO to the autoearn section\nFor mobile do the tasks and challanges and earn coins { Mobile }\nYou should Join their discord for coupon drops and more to get more coins\nFinally go to Withdraw and Withdraw your desired gift card||`
    };

    const methodEmbed = new EmbedBuilder()
        .setTitle(`🎁 Your ${rewardName}`)
        .setDescription(methodContents[rewardType])
        .setColor(0x9B59B6)
        .setFooter({ text: 'Method delivered • Please follow instructions carefully' })
        .setTimestamp();

    // Update loading message to completed
    const completedEmbed = new EmbedBuilder()
        .setTitle('✅ Payout Completed')
        .setDescription(`Delivered **${rewardName}** to ${user}`)
        .setColor(0x2ECC71)
        .addFields(
            { name: 'User', value: `${user.tag}`, inline: true },
            { name: 'Reward', value: rewardName, inline: true },
            { name: 'Type', value: 'Instant Method', inline: true },
            { name: 'Approved by', value: interaction.user.tag, inline: true }
        )
        .setTimestamp();

    await loadingMessage.edit({ embeds: [completedEmbed] });

    // Send method to user via DM
    try {
        const dmEmbed = new EmbedBuilder()
            .setTitle(`🎁 Your ${rewardName}`)
            .setDescription(methodContents[rewardType])
            .setColor(0x9B59B6)
            .addFields(
                {
                    name: '📝 Vouch Instructions',
                    value: `Please submit your vouch in <#1423687881771319380> using:\n\`+vouch Your vouch message here\`\n\nYou have **2 DAYS** to submit your vouch or you will be **BANNED FROM FUTURE EVENTS**!`,
                    inline: false
                }
            )
            .setFooter({ text: 'Method delivered • Please follow instructions carefully' })
            .setTimestamp();

        await user.send({ embeds: [dmEmbed] });

        // Record payout in database
        await pool.query(
            'INSERT INTO payouts (user_id, user_name, reward_type, status) VALUES ($1, $2, $3, $4)',
            [user.id, user.tag, rewardType, 'delivered']
        );

    } catch (error) {
        // If can't DM, send in channel with mention
        await loadingMessage.channel.send({
            content: `${user} I couldn't DM you. Here's your reward:`,
            embeds: [methodEmbed]
        });
    }
}

// Deliver account from stock - FIXED VERSION (OUT OF STOCK SEND TO DM)
async function deliverAccount(user, rewardType, rewardName, loadingMessage, interaction) {
    try {
        // Get RANDOM available stock from database
        const stockResult = await pool.query(
            'SELECT * FROM stocks WHERE service_type = $1 AND used = false ORDER BY RANDOM() LIMIT 1',
            [rewardType]
        );

        if (stockResult.rows.length === 0) {
            // No stock available - SEND TO USER DM
            const noStockEmbed = new EmbedBuilder()
                .setTitle('❌ Out of Stock')
                .setDescription(`Sorry, we're currently out of stock for **${rewardName}**. Please try again later.`)
                .setColor(0xE74C3C);

            // Update loading message to show out of stock
            const outOfStockEmbed = new EmbedBuilder()
                .setTitle('❌ Out of Stock')
                .setDescription(`Could not deliver **${rewardName}** to ${user} - Out of stock`)
                .setColor(0xE74C3C)
                .addFields(
                    { name: 'User', value: `${user.tag}`, inline: true },
                    { name: 'Reward', value: rewardName, inline: true },
                    { name: 'Status', value: 'Out of Stock', inline: true }
                )
                .setTimestamp();

            await loadingMessage.edit({ embeds: [outOfStockEmbed] });

            // Send out of stock notification to user via DM
            try {
                await user.send({ embeds: [noStockEmbed] });
            } catch (dmError) {
                console.log('Could not DM user about out of stock');
            }

            return;
        }

        const stock = stockResult.rows[0];
        const [email, password] = stock.account_data.split(':');

        // DELETE stock from database (mark as used)
        await pool.query('DELETE FROM stocks WHERE id = $1', [stock.id]);

        // Create account delivery embed
        const accountEmbed = new EmbedBuilder()
            .setTitle(`🎁 Your ${rewardName}`)
            .setColor(0x27AE60)
            .addFields(
                { name: '📧 Email', value: `\`\`\`${email}\`\`\``, inline: false },
                { name: '🔑 Password', value: `\`\`\`${password}\`\`\``, inline: false }
            )
            .setFooter({ text: 'Account delivered • Please test and submit vouch if working' })
            .setTimestamp();

        // ADD FULL ACCESS GUIDE FOR FA ACCOUNTS
        const faAccounts = ['xbox_gamepass', 'xbox_ultimate', 'fan_member', 'mega_fan', 'minecraft_full'];
        if (faAccounts.includes(rewardType)) {
            accountEmbed.addFields({
                name: '📖 How To Get Full Access',
                value: 'Here Is How To Get Full Access!\nhttps://drive.google.com/file/u/0/d/1X1H3vy1UKJPEv5kiBp60LBMCm4AktH29/view?pli=1',
                inline: false
            });
        }

        // Update loading message to completed
        const completedEmbed = new EmbedBuilder()
            .setTitle('✅ Payout Completed')
            .setDescription(`Delivered **${rewardName}** to ${user}`)
            .setColor(0x2ECC71)
            .addFields(
                { name: 'User', value: `${user.tag}`, inline: true },
                { name: 'Reward', value: rewardName, inline: true },
                { name: 'Type', value: 'Account', inline: true },
                { name: 'Approved by', value: interaction.user.tag, inline: true }
            )
            .setTimestamp();

        await loadingMessage.edit({ embeds: [completedEmbed] });

        // Send account to user via DM
        try {
            const dmEmbed = new EmbedBuilder()
                .setTitle(`🎁 Your ${rewardName}`)
                .setColor(0x27AE60)
                .addFields(
                    { name: '📧 Email', value: `\`\`\`${email}\`\`\``, inline: false },
                    { name: '🔑 Password', value: `\`\`\`${password}\`\`\``, inline: false }
                )
                .addFields(
                    {
                        name: '📝 Vouch Instructions',
                        value: `Please submit your vouch in <#1423687881771319380> using:\n\`+vouch Your vouch message here\`\n\nYou have **2 DAYS** to submit your vouch or you will be **BANNED FROM FUTURE EVENTS**!`,
                        inline: false
                    }
                )
                .setFooter({ text: 'Account delivered • Please test and submit vouch if working' })
                .setTimestamp();

            // ADD FULL ACCESS GUIDE FOR FA ACCOUNTS IN DM
            if (faAccounts.includes(rewardType)) {
                dmEmbed.addFields({
                    name: '📖 How To Get Full Access',
                    value: 'Here Is How To Get Full Access!\nhttps://drive.google.com/file/u/0/d/1X1H3vy1UKJPEv5kiBp60LBMCm4AktH29/view?pli=1',
                    inline: false
                });
            }

            await user.send({ embeds: [dmEmbed] });

            // Record payout in database
            await pool.query(
                'INSERT INTO payouts (user_id, user_name, reward_type, status) VALUES ($1, $2, $3, $4)',
                [user.id, user.tag, rewardType, 'delivered']
            );

        } catch (error) {
            // If can't DM, send in channel with mention
            await loadingMessage.channel.send({
                content: `${user} I couldn't DM you. Here's your reward:`,
                embeds: [accountEmbed]
            });
        }

    } catch (error) {
        console.error('Error delivering account:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Delivery Error')
            .setDescription('There was an error delivering your reward. Please contact staff.')
            .setColor(0xE74C3C);

        await loadingMessage.edit({ embeds: [errorEmbed] });
    }
}

// Handle working submit - REMOVED BUTTON, ONLY USE +vouch COMMAND
async function handleWorkingSubmit(interaction) {
    await interaction.reply({
        content: `📝 Please submit your vouch in <#1423687881771319380> using:\n\`+vouch Your vouch message here\`\n\nYou have **2 DAYS** to submit your vouch or you will be **BANNED FROM FUTURE EVENTS**!`,
        flags: 64
    });
}