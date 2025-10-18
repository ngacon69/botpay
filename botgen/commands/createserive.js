const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_cL56QelHwXqf@ep-weathered-night-adfcxbnu-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    ssl: {
        rejectUnauthorized: false
    }
});

// Initialize services table
async function initializeServicesTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS custom_services (
                id SERIAL PRIMARY KEY,
                service_name VARCHAR(100) NOT NULL,
                service_description TEXT,
                service_type VARCHAR(50) DEFAULT 'general',
                created_by VARCHAR(50) NOT NULL,
                created_by_name VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                is_active BOOLEAN DEFAULT TRUE
            );
        `);
        console.log('[✅] Custom services table initialized');
    } catch (error) {
        console.error('[❌] Services table initialization error:', error);
    }
}

initializeServicesTable();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('createservice')
        .setDescription('🛠️ Create a custom service')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Name of the service')
                .setRequired(true)
                .setMaxLength(100)),

    async execute(interaction) {
        if (!interaction.member.permissions.has('ADMINISTRATOR')) {
            return await interaction.reply({
                content: '❌ You need administrator permissions to create services.',
                flags: 64
            });
        }

        const serviceName = interaction.options.getString('name');

        // Create modal for service description
        const modal = new ModalBuilder()
            .setCustomId(`serviceModal_${Date.now()}`)
            .setTitle('🛠️ Service Description');

        // Description input
        const descriptionInput = new TextInputBuilder()
            .setCustomId('serviceDescription')
            .setLabel('Service Description')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Describe what this service offers...')
            .setMaxLength(1000)
            .setRequired(true);

        const descriptionRow = new ActionRowBuilder().addComponents(descriptionInput);
        modal.addComponents(descriptionRow);

        // Store basic service data
        const serviceData = {
            name: serviceName,
            creator: interaction.user
        };

        await interaction.showModal(modal);

        // Wait for modal submission
        const filter = (modalInteraction) => modalInteraction.customId === modal.data.custom_id;
        
        try {
            const modalInteraction = await interaction.awaitModalSubmit({ filter, time: 120000 });
            
            const description = modalInteraction.fields.getTextInputValue('serviceDescription');

            // Save service to database
            await pool.query(
                `INSERT INTO custom_services 
                 (service_name, service_description, created_by, created_by_name) 
                 VALUES ($1, $2, $3, $4)`,
                [serviceName, description, interaction.user.id, interaction.user.tag]
            );

            // Get service ID
            const serviceResult = await pool.query(
                'SELECT id FROM custom_services WHERE service_name = $1 ORDER BY created_at DESC LIMIT 1',
                [serviceName]
            );

            const serviceId = serviceResult.rows[0]?.id;

            // Create service embed
            const serviceEmbed = new EmbedBuilder()
                .setTitle(`🛠️ ${serviceName}`)
                .setDescription(description)
                .setColor(0x00AE86)
                .addFields(
                    {
                        name: '🆔 Service ID',
                        value: `**#${serviceId}**`,
                        inline: true
                    },
                    {
                        name: '👤 Created By',
                        value: `${interaction.user}`,
                        inline: true
                    },
                    {
                        name: '📅 Created',
                        value: `<t:${Math.floor(Date.now()/1000)}:R>`,
                        inline: true
                    },
                    {
                        name: '📊 Status',
                        value: '🟢 **Active**',
                        inline: true
                    },
                    {
                        name: '🎯 Type',
                        value: '**General Service**',
                        inline: true
                    }
                )
                .setFooter({ 
                    text: 'Custom Service Management', 
                    iconURL: interaction.user.displayAvatarURL() 
                })
                .setTimestamp();

            // Action buttons
            const actionButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`edit_service_${serviceId}`)
                        .setLabel('✏️ Edit Service')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`delete_service_${serviceId}`)
                        .setLabel('🗑️ Delete')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`add_stock_${serviceId}`)
                        .setLabel('📦 Add Stock')
                        .setStyle(ButtonStyle.Success)
                );

            await modalInteraction.reply({
                content: '✅ **Service Created Successfully!**',
                embeds: [serviceEmbed],
                components: [actionButtons],
                flags: 64
            });

        } catch (error) {
            if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
                await interaction.followUp({
                    content: '⏰ Service creation cancelled - you took too long to enter details!',
                    flags: 64
                });
            } else {
                console.error('Create service error:', error);
                await interaction.followUp({
                    content: '❌ There was an error creating the service!',
                    flags: 64
                });
            }
        }
    },
};

// Handle interactions for service buttons
module.exports.handleInteractions = (client) => {
    console.log('[🛠️] Setting up service interactions...');

    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton()) return;

        if (interaction.customId.startsWith('edit_service_')) {
            await handleEditService(interaction);
        } else if (interaction.customId.startsWith('delete_service_')) {
            await handleDeleteService(interaction);
        } else if (interaction.customId.startsWith('add_stock_')) {
            await handleAddStock(interaction);
        }
    });
};

async function handleEditService(interaction) {
    if (!interaction.member.permissions.has('ADMINISTRATOR')) {
        return await interaction.reply({
            content: '❌ You need administrator permissions to edit services.',
            flags: 64
        });
    }

    const serviceId = interaction.customId.replace('edit_service_', '');

    // Get current service data
    const serviceResult = await pool.query(
        'SELECT * FROM custom_services WHERE id = $1',
        [serviceId]
    );

    if (serviceResult.rows.length === 0) {
        return await interaction.reply({
            content: '❌ Service not found!',
            flags: 64
        });
    }

    const service = serviceResult.rows[0];

    // Create edit modal
    const modal = new ModalBuilder()
        .setCustomId(`editServiceModal_${serviceId}`)
        .setTitle('✏️ Edit Service');

    const nameInput = new TextInputBuilder()
        .setCustomId('editName')
        .setLabel('Service Name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter new service name...')
        .setValue(service.service_name)
        .setMaxLength(100)
        .setRequired(true);

    const descInput = new TextInputBuilder()
        .setCustomId('editDescription')
        .setLabel('Service Description')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter new description...')
        .setValue(service.service_description || '')
        .setMaxLength(1000)
        .setRequired(true);

    const firstRow = new ActionRowBuilder().addComponents(nameInput);
    const secondRow = new ActionRowBuilder().addComponents(descInput);

    modal.addComponents(firstRow, secondRow);

    await interaction.showModal(modal);
}

async function handleDeleteService(interaction) {
    if (!interaction.member.permissions.has('ADMINISTRATOR')) {
        return await interaction.reply({
            content: '❌ You need administrator permissions to delete services.',
            flags: 64
        });
    }

    const serviceId = interaction.customId.replace('delete_service_', '');

    const confirmEmbed = new EmbedBuilder()
        .setTitle('🗑️ Delete Service')
        .setDescription('Are you sure you want to delete this service? This action cannot be undone!')
        .setColor(0xFF0000)
        .setFooter({ text: 'Service Management' })
        .setTimestamp();

    const confirmButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_delete_${serviceId}`)
                .setLabel('✅ Confirm Delete')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`cancel_delete_${serviceId}`)
                .setLabel('❌ Cancel')
                .setStyle(ButtonStyle.Secondary)
        );

    await interaction.reply({
        embeds: [confirmEmbed],
        components: [confirmButtons],
        flags: 64
    });
}

async function handleAddStock(interaction) {
    if (!interaction.member.permissions.has('ADMINISTRATOR')) {
        return await interaction.reply({
            content: '❌ You need administrator permissions to add stock.',
            flags: 64
        });
    }

    const serviceId = interaction.customId.replace('add_stock_', '');

    // Get service info
    const serviceResult = await pool.query(
        'SELECT * FROM custom_services WHERE id = $1',
        [serviceId]
    );

    if (serviceResult.rows.length === 0) {
        return await interaction.reply({
            content: '❌ Service not found!',
            flags: 64
        });
    }

    const service = serviceResult.rows[0];

    const infoEmbed = new EmbedBuilder()
        .setTitle('📦 Add Stock to Service')
        .setDescription(`**Service:** ${service.service_name}\n\nUse \`/addstock\` command to add accounts to this service. The service will appear in the selection menu.`)
        .setColor(0x3498DB)
        .addFields(
            {
                name: '📝 Instructions',
                value: '1. Use `/addstock` command\n2. Upload your accounts file\n3. Select this service from the menu',
                inline: false
            }
        )
        .setFooter({ text: 'Stock Management' })
        .setTimestamp();

    await interaction.reply({
        embeds: [infoEmbed],
        flags: 64
    });
}

// Handle modal submissions
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isModalSubmit()) return;

    if (interaction.customId.startsWith('editServiceModal_')) {
        await handleEditServiceModal(interaction);
    }
});

async function handleEditServiceModal(interaction) {
    const serviceId = interaction.customId.replace('editServiceModal_', '');
    const newName = interaction.fields.getTextInputValue('editName');
    const newDescription = interaction.fields.getTextInputValue('editDescription');

    try {
        await pool.query(
            'UPDATE custom_services SET service_name = $1, service_description = $2 WHERE id = $3',
            [newName, newDescription, serviceId]
        );

        const updatedEmbed = new EmbedBuilder()
            .setTitle('✅ Service Updated!')
            .setDescription(`**${newName}** has been updated successfully.`)
            .setColor(0x00FF00)
            .addFields(
                {
                    name: '📝 New Description',
                    value: newDescription.substring(0, 500) + (newDescription.length > 500 ? '...' : ''),
                    inline: false
                }
            )
            .setFooter({ text: 'Service Management' })
            .setTimestamp();

        await interaction.reply({
            embeds: [updatedEmbed],
            flags: 64
        });

    } catch (error) {
        console.error('Error updating service:', error);
        await interaction.reply({
            content: '❌ There was an error updating the service!',
            flags: 64
        });
    }
}

// Handle delete confirmations
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('confirm_delete_')) {
        await handleConfirmDelete(interaction);
    } else if (interaction.customId.startsWith('cancel_delete_')) {
        await handleCancelDelete(interaction);
    }
});

async function handleConfirmDelete(interaction) {
    const serviceId = interaction.customId.replace('confirm_delete_', '');

    try {
        // Delete service from database
        await pool.query('DELETE FROM custom_services WHERE id = $1', [serviceId]);

        // Also delete associated stock if exists
        await pool.query('DELETE FROM custom_stocks WHERE service_id = $1', [serviceId]);

        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Service Deleted!')
            .setDescription('The service and all associated stock have been deleted successfully.')
            .setColor(0x00FF00)
            .setFooter({ text: 'Service Management' })
            .setTimestamp();

        await interaction.update({
            embeds: [successEmbed],
            components: []
        });

    } catch (error) {
        console.error('Error deleting service:', error);
        await interaction.update({
            content: '❌ There was an error deleting the service!',
            embeds: [],
            components: []
        });
    }
}

async function handleCancelDelete(interaction) {
    await interaction.update({
        content: '✅ Deletion cancelled.',
        embeds: [],
        components: []
    });
}