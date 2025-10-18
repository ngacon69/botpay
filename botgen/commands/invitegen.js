const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_cL56QelHwXqf@ep-weathered-night-adfcxbnu-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    ssl: {
        rejectUnauthorized: false
    }
});

// Initialize invite system tables
async function initializeInviteTables() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS invite_services (
                id SERIAL PRIMARY KEY,
                service_name VARCHAR(100) NOT NULL,
                service_description TEXT,
                invites_required INTEGER DEFAULT 1,
                created_by VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                is_active BOOLEAN DEFAULT TRUE
            );

            CREATE TABLE IF NOT EXISTS invite_users (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL UNIQUE,
                user_name VARCHAR(100) NOT NULL,
                invites_count INTEGER DEFAULT 0,
                invited_by VARCHAR(50),
                created_at TIMESTAMP DEFAULT NOW(),
                last_updated TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS invite_roles (
                id SERIAL PRIMARY KEY,
                role_id VARCHAR(50) NOT NULL UNIQUE,
                role_name VARCHAR(100) NOT NULL,
                invites_required INTEGER DEFAULT 1,
                created_by VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                is_active BOOLEAN DEFAULT TRUE
            );
        `);
        console.log('[✅] Invite system tables initialized');
    } catch (error) {
        console.error('[❌] Invite tables initialization error:', error);
    }
}

initializeInviteTables();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invitegen')
        .setDescription('🔗 Manage invite-based reward system')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Select action type')
                .setRequired(true)
                .addChoices(
                    { name: '✏️ Edit Services', value: 'edit' },
                    { name: '🛠️ Add Service', value: 'addservice' },
                    { name: '👤 Add User', value: 'adduser' },
                    { name: '🎯 Add Role Invite', value: 'addroleinvite' }
                )),

    async execute(interaction) {
        if (!interaction.member.permissions.has('ADMINISTRATOR')) {
            return await interaction.reply({
                content: '❌ You need administrator permissions to manage invite system.',
                flags: 64
            });
        }

        const actionType = interaction.options.getString('type');

        switch (actionType) {
            case 'edit':
                await handleEditServices(interaction);
                break;
            case 'addservice':
                await handleAddService(interaction);
                break;
            case 'adduser':
                await handleAddUser(interaction);
                break;
            case 'addroleinvite':
                await handleAddRoleInvite(interaction);
                break;
        }
    },
};

// ✏️ EDIT SERVICES
async function handleEditServices(interaction) {
    try {
        // Lấy danh sách services từ database
        const servicesResult = await pool.query(
            'SELECT * FROM invite_services WHERE is_active = true ORDER BY service_name'
        );

        if (servicesResult.rows.length === 0) {
            return await interaction.reply({
                content: '❌ No services found! Please add services first.',
                flags: 64
            });
        }

        // Tạo service selection menu
        const serviceOptions = servicesResult.rows.map(service => ({
            label: service.service_name.length > 25 ? service.service_name.substring(0, 22) + '...' : service.service_name,
            description: `Requires: ${service.invites_required} invites`,
            value: service.id.toString(),
            emoji: '🛠️'
        }));

        const serviceSelect = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`editServiceSelect_${interaction.id}`)
                    .setPlaceholder('Select service to edit...')
                    .addOptions(serviceOptions)
            );

        const embed = new EmbedBuilder()
            .setTitle('✏️ Edit Services')
            .setDescription('Select a service to edit its details:')
            .setColor(0x3498DB)
            .setFooter({ 
                text: 'Invite System Management', 
                iconURL: interaction.user.displayAvatarURL() 
            })
            .setTimestamp();

        await interaction.reply({
            embeds: [embed],
            components: [serviceSelect],
            flags: 64
        });

    } catch (error) {
        console.error('Edit services error:', error);
        await interaction.reply({
            content: '❌ There was an error loading services!',
            flags: 64
        });
    }
}

// 🛠️ ADD SERVICE
async function handleAddService(interaction) {
    // Create modal for new service
    const modal = new ModalBuilder()
        .setCustomId(`addServiceModal_${interaction.id}`)
        .setTitle('🛠️ Add New Service');

    // Service name input
    const nameInput = new TextInputBuilder()
        .setCustomId('serviceName')
        .setLabel('Service Name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter service name...')
        .setMaxLength(100)
        .setRequired(true);

    // Description input
    const descInput = new TextInputBuilder()
        .setCustomId('serviceDescription')
        .setLabel('Service Description')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Describe this service...')
        .setMaxLength(500)
        .setRequired(true);

    // Invites required input
    const invitesInput = new TextInputBuilder()
        .setCustomId('invitesRequired')
        .setLabel('Invites Required')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., 5, 10, 20')
        .setValue('1')
        .setMaxLength(3)
        .setRequired(true);

    const firstRow = new ActionRowBuilder().addComponents(nameInput);
    const secondRow = new ActionRowBuilder().addComponents(descInput);
    const thirdRow = new ActionRowBuilder().addComponents(invitesInput);

    modal.addComponents(firstRow, secondRow, thirdRow);

    await interaction.showModal(modal);
}

// 👤 ADD USER
async function handleAddUser(interaction) {
    // Create modal for adding user
    const modal = new ModalBuilder()
        .setCustomId(`addUserModal_${interaction.id}`)
        .setTitle('👤 Add User to Invite System');

    // User ID input
    const userIdInput = new TextInputBuilder()
        .setCustomId('userId')
        .setLabel('User ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter user ID...')
        .setMaxLength(50)
        .setRequired(true);

    // Username input
    const usernameInput = new TextInputBuilder()
        .setCustomId('userName')
        .setLabel('Username')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter username...')
        .setMaxLength(100)
        .setRequired(true);

    // Invites count input
    const invitesInput = new TextInputBuilder()
        .setCustomId('invitesCount')
        .setLabel('Initial Invites Count')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., 0, 5, 10')
        .setValue('0')
        .setMaxLength(5)
        .setRequired(true);

    const firstRow = new ActionRowBuilder().addComponents(userIdInput);
    const secondRow = new ActionRowBuilder().addComponents(usernameInput);
    const thirdRow = new ActionRowBuilder().addComponents(invitesInput);

    modal.addComponents(firstRow, secondRow, thirdRow);

    await interaction.showModal(modal);
}

// 🎯 ADD ROLE INVITE
async function handleAddRoleInvite(interaction) {
    // Create modal for adding role invite
    const modal = new ModalBuilder()
        .setCustomId(`addRoleInviteModal_${interaction.id}`)
        .setTitle('🎯 Add Role Invite Requirement');

    // Role ID input
    const roleIdInput = new TextInputBuilder()
        .setCustomId('roleId')
        .setLabel('Role ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter role ID...')
        .setMaxLength(50)
        .setRequired(true);

    // Role name input
    const roleNameInput = new TextInputBuilder()
        .setCustomId('roleName')
        .setLabel('Role Name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter role name...')
        .setMaxLength(100)
        .setRequired(true);

    // Invites required input
    const invitesInput = new TextInputBuilder()
        .setCustomId('roleInvitesRequired')
        .setLabel('Invites Required for Role')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., 5, 10, 20')
        .setValue('1')
        .setMaxLength(5)
        .setRequired(true);

    const firstRow = new ActionRowBuilder().addComponents(roleIdInput);
    const secondRow = new ActionRowBuilder().addComponents(roleNameInput);
    const thirdRow = new ActionRowBuilder().addComponents(invitesInput);

    modal.addComponents(firstRow, secondRow, thirdRow);

    await interaction.showModal(modal);
}

// Handle all interactions
module.exports.handleInteractions = (client) => {
    console.log('[🔗] Setting up invitegen interactions...');

    // Handle service selection for editing
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isStringSelectMenu()) return;

        if (interaction.customId.startsWith('editServiceSelect_')) {
            await handleEditServiceSelection(interaction);
        }
    });

    // Handle modal submissions
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isModalSubmit()) return;

        if (interaction.customId.startsWith('addServiceModal_')) {
            await handleAddServiceModal(interaction);
        } else if (interaction.customId.startsWith('addUserModal_')) {
            await handleAddUserModal(interaction);
        } else if (interaction.customId.startsWith('addRoleInviteModal_')) {
            await handleAddRoleInviteModal(interaction);
        } else if (interaction.customId.startsWith('editServiceModal_')) {
            await handleEditServiceModal(interaction);
        }
    });
};

// Handle edit service selection
async function handleEditServiceSelection(interaction) {
    try {
        await interaction.deferUpdate();
        
        const serviceId = interaction.values[0];

        // Get service info
        const serviceResult = await pool.query(
            'SELECT * FROM invite_services WHERE id = $1',
            [serviceId]
        );

        if (serviceResult.rows.length === 0) {
            return await interaction.editReply({
                content: '❌ Service not found!',
                components: []
            });
        }

        const service = serviceResult.rows[0];

        // Create edit modal
        const modal = new ModalBuilder()
            .setCustomId(`editServiceModal_${serviceId}`)
            .setTitle('✏️ Edit Service');

        // Service name input
        const nameInput = new TextInputBuilder()
            .setCustomId('editServiceName')
            .setLabel('Service Name')
            .setStyle(TextInputStyle.Short)
            .setValue(service.service_name)
            .setMaxLength(100)
            .setRequired(true);

        // Description input
        const descInput = new TextInputBuilder()
            .setCustomId('editServiceDescription')
            .setLabel('Service Description')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(service.service_description || '')
            .setMaxLength(500)
            .setRequired(true);

        // Invites required input
        const invitesInput = new TextInputBuilder()
            .setCustomId('editInvitesRequired')
            .setLabel('Invites Required')
            .setStyle(TextInputStyle.Short)
            .setValue(service.invites_required.toString())
            .setMaxLength(3)
            .setRequired(true);

        const firstRow = new ActionRowBuilder().addComponents(nameInput);
        const secondRow = new ActionRowBuilder().addComponents(descInput);
        const thirdRow = new ActionRowBuilder().addComponents(invitesInput);

        modal.addComponents(firstRow, secondRow, thirdRow);

        await interaction.showModal(modal);

    } catch (error) {
        console.error('Edit service selection error:', error);
        await interaction.editReply({
            content: '❌ There was an error processing your selection.',
            components: []
        });
    }
}

// Handle add service modal
async function handleAddServiceModal(interaction) {
    try {
        const serviceName = interaction.fields.getTextInputValue('serviceName');
        const serviceDescription = interaction.fields.getTextInputValue('serviceDescription');
        const invitesRequired = parseInt(interaction.fields.getTextInputValue('invitesRequired'));

        // Save service to database
        await pool.query(
            `INSERT INTO invite_services 
             (service_name, service_description, invites_required, created_by) 
             VALUES ($1, $2, $3, $4)`,
            [serviceName, serviceDescription, invitesRequired, interaction.user.id]
        );

        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Service Added Successfully!')
            .setColor(0x2ECC71)
            .addFields(
                { name: '🛠️ Service Name', value: serviceName, inline: true },
                { name: '📋 Description', value: serviceDescription.substring(0, 100) + (serviceDescription.length > 100 ? '...' : ''), inline: false },
                { name: '🔗 Invites Required', value: invitesRequired.toString(), inline: true },
                { name: '👤 Added By', value: interaction.user.tag, inline: true }
            )
            .setFooter({ text: 'Invite System • Service Management' })
            .setTimestamp();

        await interaction.reply({
            embeds: [successEmbed],
            flags: 64
        });

    } catch (error) {
        console.error('Add service modal error:', error);
        await interaction.reply({
            content: '❌ There was an error adding the service!',
            flags: 64
        });
    }
}

// Handle add user modal
async function handleAddUserModal(interaction) {
    try {
        const userId = interaction.fields.getTextInputValue('userId');
        const userName = interaction.fields.getTextInputValue('userName');
        const invitesCount = parseInt(interaction.fields.getTextInputValue('invitesCount'));

        // Save user to database
        await pool.query(
            `INSERT INTO invite_users (user_id, user_name, invites_count) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (user_id) 
             DO UPDATE SET 
                 user_name = EXCLUDED.user_name,
                 invites_count = EXCLUDED.invites_count,
                 last_updated = NOW()`,
            [userId, userName, invitesCount]
        );

        const successEmbed = new EmbedBuilder()
            .setTitle('✅ User Added/Updated Successfully!')
            .setColor(0x2ECC71)
            .addFields(
                { name: '👤 User ID', value: userId, inline: true },
                { name: '📛 Username', value: userName, inline: true },
                { name: '🔗 Invites Count', value: invitesCount.toString(), inline: true },
                { name: '👤 Managed By', value: interaction.user.tag, inline: true }
            )
            .setFooter({ text: 'Invite System • User Management' })
            .setTimestamp();

        await interaction.reply({
            embeds: [successEmbed],
            flags: 64
        });

    } catch (error) {
        console.error('Add user modal error:', error);
        await interaction.reply({
            content: '❌ There was an error adding/updating the user!',
            flags: 64
        });
    }
}

// Handle add role invite modal
async function handleAddRoleInviteModal(interaction) {
    try {
        const roleId = interaction.fields.getTextInputValue('roleId');
        const roleName = interaction.fields.getTextInputValue('roleName');
        const invitesRequired = parseInt(interaction.fields.getTextInputValue('roleInvitesRequired'));

        // Save role to database
        await pool.query(
            `INSERT INTO invite_roles (role_id, role_name, invites_required, created_by) 
             VALUES ($1, $2, $3, $4) 
             ON CONFLICT (role_id) 
             DO UPDATE SET 
                 role_name = EXCLUDED.role_name,
                 invites_required = EXCLUDED.invites_required`,
            [roleId, roleName, invitesRequired, interaction.user.id]
        );

        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Role Invite Requirement Added!')
            .setColor(0x2ECC71)
            .addFields(
                { name: '🎯 Role ID', value: roleId, inline: true },
                { name: '📛 Role Name', value: roleName, inline: true },
                { name: '🔗 Invites Required', value: invitesRequired.toString(), inline: true },
                { name: '👤 Managed By', value: interaction.user.tag, inline: true }
            )
            .setFooter({ text: 'Invite System • Role Management' })
            .setTimestamp();

        await interaction.reply({
            embeds: [successEmbed],
            flags: 64
        });

    } catch (error) {
        console.error('Add role invite modal error:', error);
        await interaction.reply({
            content: '❌ There was an error adding/updating the role requirement!',
            flags: 64
        });
    }
}

// Handle edit service modal
async function handleEditServiceModal(interaction) {
    try {
        const serviceId = interaction.customId.replace('editServiceModal_', '');
        const serviceName = interaction.fields.getTextInputValue('editServiceName');
        const serviceDescription = interaction.fields.getTextInputValue('editServiceDescription');
        const invitesRequired = parseInt(interaction.fields.getTextInputValue('editInvitesRequired'));

        // Update service in database
        await pool.query(
            'UPDATE invite_services SET service_name = $1, service_description = $2, invites_required = $3 WHERE id = $4',
            [serviceName, serviceDescription, invitesRequired, serviceId]
        );

        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Service Updated Successfully!')
            .setColor(0x2ECC71)
            .addFields(
                { name: '🛠️ Service Name', value: serviceName, inline: true },
                { name: '📋 Description', value: serviceDescription.substring(0, 100) + (serviceDescription.length > 100 ? '...' : ''), inline: false },
                { name: '🔗 Invites Required', value: invitesRequired.toString(), inline: true },
                { name: '👤 Updated By', value: interaction.user.tag, inline: true }
            )
            .setFooter({ text: 'Invite System • Service Management' })
            .setTimestamp();

        await interaction.reply({
            embeds: [successEmbed],
            flags: 64
        });

    } catch (error) {
        console.error('Edit service modal error:', error);
        await interaction.reply({
            content: '❌ There was an error updating the service!',
            flags: 64
        });
    }
}