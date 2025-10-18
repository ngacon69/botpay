const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_cL56QelHwXqf@ep-weathered-night-adfcxbnu-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    ssl: {
        rejectUnauthorized: false
    }
});

// Initialize premium system tables
async function initializePremiumTables() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS premium_services (
                id SERIAL PRIMARY KEY,
                service_name VARCHAR(100) NOT NULL,
                service_description TEXT,
                premium_days_required INTEGER DEFAULT 1,
                created_by VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                is_active BOOLEAN DEFAULT TRUE
            );

            CREATE TABLE IF NOT EXISTS premium_users (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL UNIQUE,
                user_name VARCHAR(100) NOT NULL,
                premium_days INTEGER DEFAULT 0,
                premium_until TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                last_updated TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS premium_roles (
                id SERIAL PRIMARY KEY,
                role_id VARCHAR(50) NOT NULL UNIQUE,
                role_name VARCHAR(100) NOT NULL,
                premium_days_required INTEGER DEFAULT 1,
                created_by VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                is_active BOOLEAN DEFAULT TRUE
            );
        `);
        console.log('[✅] Premium system tables initialized');
    } catch (error) {
        console.error('[❌] Premium tables initialization error:', error);
    }
}

initializePremiumTables();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('premiumgen')
        .setDescription('⭐ Manage premium-based reward system')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Select action type')
                .setRequired(true)
                .addChoices(
                    { name: '✏️ Edit Services', value: 'edit' },
                    { name: '🛠️ Add Service', value: 'addservice' },
                    { name: '👤 Add User', value: 'adduser' },
                    { name: '🎯 Add Role Premium', value: 'addrolepremium' }
                )),

    async execute(interaction) {
        if (!interaction.member.permissions.has('ADMINISTRATOR')) {
            return await interaction.reply({
                content: '❌ You need administrator permissions to manage premium system.',
                flags: 64
            });
        }

        const actionType = interaction.options.getString('type');

        switch (actionType) {
            case 'edit':
                await handleEditPremiumServices(interaction);
                break;
            case 'addservice':
                await handleAddPremiumService(interaction);
                break;
            case 'adduser':
                await handleAddPremiumUser(interaction);
                break;
            case 'addrolepremium':
                await handleAddRolePremium(interaction);
                break;
        }
    },
};

// ✏️ EDIT PREMIUM SERVICES
async function handleEditPremiumServices(interaction) {
    try {
        // Lấy danh sách premium services từ database
        const servicesResult = await pool.query(
            'SELECT * FROM premium_services WHERE is_active = true ORDER BY service_name'
        );

        if (servicesResult.rows.length === 0) {
            return await interaction.reply({
                content: '❌ No premium services found! Please add services first.',
                flags: 64
            });
        }

        // Tạo service selection menu
        const serviceOptions = servicesResult.rows.map(service => ({
            label: service.service_name.length > 25 ? service.service_name.substring(0, 22) + '...' : service.service_name,
            description: `Requires: ${service.premium_days_required} days`,
            value: service.id.toString(),
            emoji: '⭐'
        }));

        const serviceSelect = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`editPremiumServiceSelect_${interaction.id}`)
                    .setPlaceholder('Select premium service to edit...')
                    .addOptions(serviceOptions)
            );

        const embed = new EmbedBuilder()
            .setTitle('✏️ Edit Premium Services')
            .setDescription('Select a premium service to edit its details:')
            .setColor(0xF39C12)
            .setFooter({ 
                text: 'Premium System Management', 
                iconURL: interaction.user.displayAvatarURL() 
            })
            .setTimestamp();

        await interaction.reply({
            embeds: [embed],
            components: [serviceSelect],
            flags: 64
        });

    } catch (error) {
        console.error('Edit premium services error:', error);
        await interaction.reply({
            content: '❌ There was an error loading premium services!',
            flags: 64
        });
    }
}

// 🛠️ ADD PREMIUM SERVICE
async function handleAddPremiumService(interaction) {
    // Create modal for new premium service
    const modal = new ModalBuilder()
        .setCustomId(`addPremiumServiceModal_${interaction.id}`)
        .setTitle('⭐ Add New Premium Service');

    // Service name input
    const nameInput = new TextInputBuilder()
        .setCustomId('premiumServiceName')
        .setLabel('Premium Service Name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter premium service name...')
        .setMaxLength(100)
        .setRequired(true);

    // Description input
    const descInput = new TextInputBuilder()
        .setCustomId('premiumServiceDescription')
        .setLabel('Service Description')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Describe this premium service...')
        .setMaxLength(500)
        .setRequired(true);

    // Premium days required input
    const daysInput = new TextInputBuilder()
        .setCustomId('premiumDaysRequired')
        .setLabel('Premium Days Required')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., 7, 30, 90')
        .setValue('1')
        .setMaxLength(3)
        .setRequired(true);

    const firstRow = new ActionRowBuilder().addComponents(nameInput);
    const secondRow = new ActionRowBuilder().addComponents(descInput);
    const thirdRow = new ActionRowBuilder().addComponents(daysInput);

    modal.addComponents(firstRow, secondRow, thirdRow);

    await interaction.showModal(modal);
}

// 👤 ADD PREMIUM USER
async function handleAddPremiumUser(interaction) {
    // Create modal for adding premium user
    const modal = new ModalBuilder()
        .setCustomId(`addPremiumUserModal_${interaction.id}`)
        .setTitle('👤 Add User to Premium System');

    // User ID input
    const userIdInput = new TextInputBuilder()
        .setCustomId('premiumUserId')
        .setLabel('User ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter user ID...')
        .setMaxLength(50)
        .setRequired(true);

    // Username input
    const usernameInput = new TextInputBuilder()
        .setCustomId('premiumUserName')
        .setLabel('Username')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter username...')
        .setMaxLength(100)
        .setRequired(true);

    // Premium days input
    const daysInput = new TextInputBuilder()
        .setCustomId('premiumDays')
        .setLabel('Premium Days')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., 7, 30, 90, 365')
        .setValue('0')
        .setMaxLength(5)
        .setRequired(true);

    const firstRow = new ActionRowBuilder().addComponents(userIdInput);
    const secondRow = new ActionRowBuilder().addComponents(usernameInput);
    const thirdRow = new ActionRowBuilder().addComponents(daysInput);

    modal.addComponents(firstRow, secondRow, thirdRow);

    await interaction.showModal(modal);
}

// 🎯 ADD ROLE PREMIUM
async function handleAddRolePremium(interaction) {
    // Create modal for adding role premium
    const modal = new ModalBuilder()
        .setCustomId(`addRolePremiumModal_${interaction.id}`)
        .setTitle('🎯 Add Role Premium Requirement');

    // Role ID input
    const roleIdInput = new TextInputBuilder()
        .setCustomId('premiumRoleId')
        .setLabel('Role ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter role ID...')
        .setMaxLength(50)
        .setRequired(true);

    // Role name input
    const roleNameInput = new TextInputBuilder()
        .setCustomId('premiumRoleName')
        .setLabel('Role Name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter role name...')
        .setMaxLength(100)
        .setRequired(true);

    // Premium days required input
    const daysInput = new TextInputBuilder()
        .setCustomId('rolePremiumDaysRequired')
        .setLabel('Premium Days Required for Role')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., 7, 30, 90')
        .setValue('1')
        .setMaxLength(5)
        .setRequired(true);

    const firstRow = new ActionRowBuilder().addComponents(roleIdInput);
    const secondRow = new ActionRowBuilder().addComponents(roleNameInput);
    const thirdRow = new ActionRowBuilder().addComponents(daysInput);

    modal.addComponents(firstRow, secondRow, thirdRow);

    await interaction.showModal(modal);
}

// Handle all interactions
module.exports.handleInteractions = (client) => {
    console.log('[⭐] Setting up premiumgen interactions...');

    // Handle premium service selection for editing
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isStringSelectMenu()) return;

        if (interaction.customId.startsWith('editPremiumServiceSelect_')) {
            await handleEditPremiumServiceSelection(interaction);
        }
    });

    // Handle modal submissions
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isModalSubmit()) return;

        if (interaction.customId.startsWith('addPremiumServiceModal_')) {
            await handleAddPremiumServiceModal(interaction);
        } else if (interaction.customId.startsWith('addPremiumUserModal_')) {
            await handleAddPremiumUserModal(interaction);
        } else if (interaction.customId.startsWith('addRolePremiumModal_')) {
            await handleAddRolePremiumModal(interaction);
        } else if (interaction.customId.startsWith('editPremiumServiceModal_')) {
            await handleEditPremiumServiceModal(interaction);
        }
    });
};

// Handle edit premium service selection
async function handleEditPremiumServiceSelection(interaction) {
    try {
        await interaction.deferUpdate();
        
        const serviceId = interaction.values[0];

        // Get premium service info
        const serviceResult = await pool.query(
            'SELECT * FROM premium_services WHERE id = $1',
            [serviceId]
        );

        if (serviceResult.rows.length === 0) {
            return await interaction.editReply({
                content: '❌ Premium service not found!',
                components: []
            });
        }

        const service = serviceResult.rows[0];

        // Create edit modal
        const modal = new ModalBuilder()
            .setCustomId(`editPremiumServiceModal_${serviceId}`)
            .setTitle('✏️ Edit Premium Service');

        // Service name input
        const nameInput = new TextInputBuilder()
            .setCustomId('editPremiumServiceName')
            .setLabel('Premium Service Name')
            .setStyle(TextInputStyle.Short)
            .setValue(service.service_name)
            .setMaxLength(100)
            .setRequired(true);

        // Description input
        const descInput = new TextInputBuilder()
            .setCustomId('editPremiumServiceDescription')
            .setLabel('Service Description')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(service.service_description || '')
            .setMaxLength(500)
            .setRequired(true);

        // Premium days required input
        const daysInput = new TextInputBuilder()
            .setCustomId('editPremiumDaysRequired')
            .setLabel('Premium Days Required')
            .setStyle(TextInputStyle.Short)
            .setValue(service.premium_days_required.toString())
            .setMaxLength(3)
            .setRequired(true);

        const firstRow = new ActionRowBuilder().addComponents(nameInput);
        const secondRow = new ActionRowBuilder().addComponents(descInput);
        const thirdRow = new ActionRowBuilder().addComponents(daysInput);

        modal.addComponents(firstRow, secondRow, thirdRow);

        await interaction.showModal(modal);

    } catch (error) {
        console.error('Edit premium service selection error:', error);
        await interaction.editReply({
            content: '❌ There was an error processing your selection.',
            components: []
        });
    }
}

// Handle add premium service modal
async function handleAddPremiumServiceModal(interaction) {
    try {
        const serviceName = interaction.fields.getTextInputValue('premiumServiceName');
        const serviceDescription = interaction.fields.getTextInputValue('premiumServiceDescription');
        const premiumDaysRequired = parseInt(interaction.fields.getTextInputValue('premiumDaysRequired'));

        // Save premium service to database
        await pool.query(
            `INSERT INTO premium_services 
             (service_name, service_description, premium_days_required, created_by) 
             VALUES ($1, $2, $3, $4)`,
            [serviceName, serviceDescription, premiumDaysRequired, interaction.user.id]
        );

        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Premium Service Added Successfully!')
            .setColor(0xF39C12)
            .addFields(
                { name: '⭐ Service Name', value: serviceName, inline: true },
                { name: '📋 Description', value: serviceDescription.substring(0, 100) + (serviceDescription.length > 100 ? '...' : ''), inline: false },
                { name: '📅 Premium Days Required', value: premiumDaysRequired.toString(), inline: true },
                { name: '👤 Added By', value: interaction.user.tag, inline: true }
            )
            .setFooter({ text: 'Premium System • Service Management' })
            .setTimestamp();

        await interaction.reply({
            embeds: [successEmbed],
            flags: 64
        });

    } catch (error) {
        console.error('Add premium service modal error:', error);
        await interaction.reply({
            content: '❌ There was an error adding the premium service!',
            flags: 64
        });
    }
}

// Handle add premium user modal
async function handleAddPremiumUserModal(interaction) {
    try {
        const userId = interaction.fields.getTextInputValue('premiumUserId');
        const userName = interaction.fields.getTextInputValue('premiumUserName');
        const premiumDays = parseInt(interaction.fields.getTextInputValue('premiumDays'));

        // Calculate premium until date
        const premiumUntil = premiumDays > 0 ? 
            new Date(Date.now() + premiumDays * 24 * 60 * 60 * 1000) : 
            null;

        // Save premium user to database
        await pool.query(
            `INSERT INTO premium_users (user_id, user_name, premium_days, premium_until) 
             VALUES ($1, $2, $3, $4) 
             ON CONFLICT (user_id) 
             DO UPDATE SET 
                 user_name = EXCLUDED.user_name,
                 premium_days = EXCLUDED.premium_days,
                 premium_until = EXCLUDED.premium_until,
                 last_updated = NOW()`,
            [userId, userName, premiumDays, premiumUntil]
        );

        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Premium User Added/Updated Successfully!')
            .setColor(0xF39C12)
            .addFields(
                { name: '👤 User ID', value: userId, inline: true },
                { name: '📛 Username', value: userName, inline: true },
                { name: '⭐ Premium Days', value: premiumDays.toString(), inline: true },
                { name: '📅 Premium Until', value: premiumUntil ? `<t:${Math.floor(premiumUntil.getTime()/1000)}:F>` : 'Not premium', inline: false },
                { name: '👤 Managed By', value: interaction.user.tag, inline: true }
            )
            .setFooter({ text: 'Premium System • User Management' })
            .setTimestamp();

        await interaction.reply({
            embeds: [successEmbed],
            flags: 64
        });

    } catch (error) {
        console.error('Add premium user modal error:', error);
        await interaction.reply({
            content: '❌ There was an error adding/updating the premium user!',
            flags: 64
        });
    }
}

// Handle add role premium modal
async function handleAddRolePremiumModal(interaction) {
    try {
        const roleId = interaction.fields.getTextInputValue('premiumRoleId');
        const roleName = interaction.fields.getTextInputValue('premiumRoleName');
        const premiumDaysRequired = parseInt(interaction.fields.getTextInputValue('rolePremiumDaysRequired'));

        // Save premium role to database
        await pool.query(
            `INSERT INTO premium_roles (role_id, role_name, premium_days_required, created_by) 
             VALUES ($1, $2, $3, $4) 
             ON CONFLICT (role_id) 
             DO UPDATE SET 
                 role_name = EXCLUDED.role_name,
                 premium_days_required = EXCLUDED.premium_days_required`,
            [roleId, roleName, premiumDaysRequired, interaction.user.id]
        );

        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Role Premium Requirement Added!')
            .setColor(0xF39C12)
            .addFields(
                { name: '🎯 Role ID', value: roleId, inline: true },
                { name: '📛 Role Name', value: roleName, inline: true },
                { name: '⭐ Premium Days Required', value: premiumDaysRequired.toString(), inline: true },
                { name: '👤 Managed By', value: interaction.user.tag, inline: true }
            )
            .setFooter({ text: 'Premium System • Role Management' })
            .setTimestamp();

        await interaction.reply({
            embeds: [successEmbed],
            flags: 64
        });

    } catch (error) {
        console.error('Add role premium modal error:', error);
        await interaction.reply({
            content: '❌ There was an error adding/updating the role premium requirement!',
            flags: 64
        });
    }
}

// Handle edit premium service modal
async function handleEditPremiumServiceModal(interaction) {
    try {
        const serviceId = interaction.customId.replace('editPremiumServiceModal_', '');
        const serviceName = interaction.fields.getTextInputValue('editPremiumServiceName');
        const serviceDescription = interaction.fields.getTextInputValue('editPremiumServiceDescription');
        const premiumDaysRequired = parseInt(interaction.fields.getTextInputValue('editPremiumDaysRequired'));

        // Update premium service in database
        await pool.query(
            'UPDATE premium_services SET service_name = $1, service_description = $2, premium_days_required = $3 WHERE id = $4',
            [serviceName, serviceDescription, premiumDaysRequired, serviceId]
        );

        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Premium Service Updated Successfully!')
            .setColor(0xF39C12)
            .addFields(
                { name: '⭐ Service Name', value: serviceName, inline: true },
                { name: '📋 Description', value: serviceDescription.substring(0, 100) + (serviceDescription.length > 100 ? '...' : ''), inline: false },
                { name: '📅 Premium Days Required', value: premiumDaysRequired.toString(), inline: true },
                { name: '👤 Updated By', value: interaction.user.tag, inline: true }
            )
            .setFooter({ text: 'Premium System • Service Management' })
            .setTimestamp();

        await interaction.reply({
            embeds: [successEmbed],
            flags: 64
        });

    } catch (error) {
        console.error('Edit premium service modal error:', error);
        await interaction.reply({
            content: '❌ There was an error updating the premium service!',
            flags: 64
        });
    }
}