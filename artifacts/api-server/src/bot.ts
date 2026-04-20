import {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type TextChannel,
  type Message,
  ActivityType,
} from "discord.js";
import { logger } from "./lib/logger";

const token = process.env["TOKEN"];

if (!token) {
  logger.error("TOKEN environment variable is required but was not provided.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
});

function updateBotStatus() {
  let online = 0;
  let offline = 0;

  for (const guild of client.guilds.cache.values()) {
    guild.members.cache.filter((m) => !m.user.bot).forEach((member) => {
      const status = member.presence?.status;
      if (status && status !== "offline" && status !== "invisible") {
        online++;
      } else {
        offline++;
      }
    });
  }

  client.user?.setActivity(`🧑 ${online} connecté(s) | 💤 ${offline} déconnecté(s)`, {
    type: ActivityType.Watching,
  });
}

const OWNER_ID = "838445754484916236";
const ROLE_SELECTOR_CHANNEL_ID = "1495327287229546657";
const CYREX_MEMBRE_ROLE_NAME = "Cyrex Membre";
const CLAN_CHANNEL_ID = "1495126089536897086";
const CLAN_ROLES = ["EU Clan", "EU Event"];

client.on("ready", async () => {
  logger.info({ tag: client.user?.tag }, "Discord bot connected");
  for (const guild of client.guilds.cache.values()) {
    await guild.members.fetch().catch(() => {});

    const existing = guild.roles.cache.find((r) => r.name === CYREX_MEMBRE_ROLE_NAME);
    if (!existing) {
      await guild.roles.create({
        name: CYREX_MEMBRE_ROLE_NAME,
        color: 0x9b59b6,
        reason: "Rôle créé automatiquement par le bot",
      }).catch(() => {});
      logger.info({ guild: guild.name }, `Rôle "${CYREX_MEMBRE_ROLE_NAME}" créé`);
    }

    for (const roleName of CLAN_ROLES) {
      const exists = guild.roles.cache.find((r) => r.name === roleName);
      if (!exists) {
        await guild.roles.create({
          name: roleName,
          color: roleName === "EU Clan" ? 0x3498db : 0xe74c3c,
          reason: "Rôle créé automatiquement par le bot",
        }).catch(() => {});
        logger.info({ guild: guild.name }, `Rôle "${roleName}" créé`);
      }
    }
  }
  updateBotStatus();
  setInterval(updateBotStatus, 60_000);
});

// Stocke l'ID du message de statut par serveur
const statusMessages = new Map<string, Message>();

async function updateStatusMessage(guildId: string, channelId: string) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  await guild.members.fetch();

  const members = guild.members.cache.filter((m) => !m.user.bot);

  const online: string[] = [];
  const offline: string[] = [];

  members.forEach((member) => {
    const status = member.presence?.status;
    if (status && status !== "offline" && status !== "invisible") {
      online.push(`🟢 ${member.displayName}`);
    } else {
      offline.push(`⚫ ${member.displayName}`);
    }
  });

  const content =
    `## 👥 Membres du serveur\n\n` +
    `**En ligne — ${online.length}**\n` +
    (online.length > 0 ? online.join("\n") : "*Personne en ligne*") +
    `\n\n**Hors ligne — ${offline.length}**\n` +
    (offline.length > 0 ? offline.join("\n") : "*Tout le monde est en ligne*") +
    `\n\n*Mis à jour : <t:${Math.floor(Date.now() / 1000)}:R>*`;

  const existing = statusMessages.get(guildId);
  if (existing) {
    try {
      await existing.edit(content);
      return;
    } catch {
      statusMessages.delete(guildId);
    }
  }

  const channel = guild.channels.cache.get(channelId) as TextChannel | undefined;
  if (!channel) return;

  const msg = await channel.send(content);
  statusMessages.set(guildId, msg);
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content === "!ticket") {
    if (message.author.id !== OWNER_ID) {
      await message.reply("❌ Tu n'as pas la permission d'utiliser cette commande.");
      return;
    }

    const bouton = new ButtonBuilder()
      .setCustomId("ticket")
      .setLabel("🎫 Ouvrir un ticket")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(bouton);

    await message.channel.send({
      content: "🌌 Clique pour ouvrir un ticket",
      components: [row],
    });
  }

  if (message.content === "!membres") {
    if (message.author.id !== OWNER_ID) {
      await message.reply("❌ Tu n'as pas la permission d'utiliser cette commande.");
      return;
    }

    await updateStatusMessage(message.guildId!, message.channelId);
    await message.delete().catch(() => {});
  }

  if (message.content === "!clans") {
    if (message.author.id !== OWNER_ID) {
      await message.reply("❌ Tu n'as pas la permission d'utiliser cette commande.");
      return;
    }

    const channel = message.guild?.channels.cache.get(CLAN_CHANNEL_ID) as TextChannel | undefined;
    if (!channel) {
      await message.reply("❌ Salon introuvable.");
      return;
    }

    const euClanRole = message.guild?.roles.cache.find((r) => r.name === "EU Clan");
    const euEventRole = message.guild?.roles.cache.find((r) => r.name === "EU Event");

    const embed = new EmbedBuilder()
      .setTitle("🌍 EU Servers — Role Selection")
      .setDescription(
        "Select the server(s) you would like to play on to unlock the respective channels.\n\n" +
        "You can pick multiple roles and if you wish to remove one, simply click the button again.\n\n" +
        `🇪🇺 ${euClanRole ? euClanRole.toString() : "**EU Clan**"}\n` +
        `🏴‍☠️ ${euEventRole ? euEventRole.toString() : "**EU Event**"}`
      )
      .setColor(0x5865f2)
      .setFooter({ text: "Cyrex Community • Role Selection" })
      .setTimestamp();

    const euClanButton = new ButtonBuilder()
      .setCustomId("role_eu_clan")
      .setLabel("EU Clan")
      .setEmoji("🇪🇺")
      .setStyle(ButtonStyle.Primary);

    const euEventButton = new ButtonBuilder()
      .setCustomId("role_eu_event")
      .setLabel("EU Event")
      .setEmoji("🏴‍☠️")
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(euClanButton, euEventButton);

    await channel.send({ embeds: [embed], components: [row] });
    await message.delete().catch(() => {});
  }

  if (message.content === "!rules") {
    if (message.author.id !== OWNER_ID) {
      await message.reply("❌ Tu n'as pas la permission d'utiliser cette commande.");
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("SERVEUR RULES")
      .setDescription("Please read and follow these rules to avoid penalties.")
      .addFields(
        {
          name: "DISCORD RULES",
          value:
            "• **Racist insults are not allowed:** 6 hours mute\n" +
            "• **Insults toward staff:** 24 hours mute\n" +
            "• **Spamming tickets or spamming @mentions:** 1 hour mute",
        },
        {
          name: "INGAME RULES",
          value:
            "• **Inside is not allowed:** 24 hours ban\n" +
            "• **Code raiding is not allowed:** 12 hours ban",
        }
      )
      .setColor(0x9b59b6)
      .setFooter({ text: "Cyrex" });

    await message.channel.send({ embeds: [embed] });
    await message.delete().catch(() => {});
  }

  if (message.content === "!gaming") {
    if (message.author.id !== OWNER_ID) {
      await message.reply("❌ Tu n'as pas la permission d'utiliser cette commande.");
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("🎮 Link Your Gaming Account")
      .setDescription(
        "Welcome to the **Cyrex Gaming** network!\n\n" +
        "Connect your gaming account to let other members know what platform you play on " +
        "and make it easier to find teammates, join parties, and get invited to events.\n\n" +
        "**Why link your account?**\n" +
        "• Let other members find you by your GamerTag or PSN ID\n" +
        "• Get matched with players on the same platform\n" +
        "• Receive platform-specific role and channel access\n" +
        "• Get notified about platform-exclusive events and tournaments\n" +
        "• Show off your platform loyalty in the community\n\n" +
        "**Supported platforms:**\n" +
        "🎮 **PlayStation** — Enter your PSN ID\n" +
        "🟩 **Xbox** — Enter your GamerTag\n\n" +
        "**How it works:**\n" +
        "Click **Link Your Gaming Account** below, enter your GamerTag or PSN ID and your console. " +
        "Your role will be assigned instantly.\n" +
        "If you ever change platform or want to remove your account, click **Unlink** to disconnect.\n\n" +
        "*Your account details are only used to assign your role and are never shared publicly.*"
      )
      .setColor(0x57f287)
      .setFooter({ text: "Cyrex Gaming • Account Linking" })
      .setTimestamp();

    const linkButton = new ButtonBuilder()
      .setCustomId("gaming_link")
      .setLabel("🎮 Link Your Gaming Account")
      .setStyle(ButtonStyle.Primary);

    const unlinkButton = new ButtonBuilder()
      .setCustomId("gaming_unlink")
      .setLabel("🔗 Unlink")
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(linkButton, unlinkButton);

    await message.channel.send({ embeds: [embed], components: [row] });
    await message.delete().catch(() => {});
  }

  if (message.content === "!roles") {
    if (message.author.id !== OWNER_ID) {
      await message.reply("❌ Tu n'as pas la permission d'utiliser cette commande.");
      return;
    }

    const channel = message.guild?.channels.cache.get(ROLE_SELECTOR_CHANNEL_ID) as TextChannel | undefined;
    if (!channel) {
      await message.reply("❌ Salon introuvable.");
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("🏅 Cyrex Member Role")
      .setDescription(
        "Welcome to the **Cyrex** community!\n\n" +
        "By claiming the **Cyrex Membre** role, you gain full access to all member-exclusive channels, events, and announcements across our server.\n\n" +
        "**What you get as a Cyrex Member:**\n" +
        "• Access to exclusive member-only channels\n" +
        "• Priority support from our staff team\n" +
        "• Early access to events and announcements\n" +
        "• The ability to participate in community votes and polls\n" +
        "• A special badge displayed next to your name\n\n" +
        "**How it works:**\n" +
        "Simply click the button below to instantly receive the **Cyrex Membre** role. " +
        "If you already have the role and wish to remove it, clicking the button again will take it away.\n\n" +
        "This role is free and available to all members of the server. " +
        "We encourage everyone to grab it and become an active part of the Cyrex family!\n\n" +
        "*Click the button below to get started.*"
      )
      .setColor(0x5865f2)
      .setFooter({ text: "Cyrex Community • Role Management" })
      .setTimestamp();

    const roleButton = new ButtonBuilder()
      .setCustomId("role_cyrex_membre")
      .setLabel("👤 Cyrex Membre")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(roleButton);

    await channel.send({ embeds: [embed], components: [row] });
    await message.delete().catch(() => {});
  }
});

// Mise à jour automatique quand un membre change de statut
client.on("presenceUpdate", async () => {
  await updateBotStatus();
});

client.on("interactionCreate", async (interaction) => {

  // Bouton Unlink → retire les rôles gaming
  if (interaction.isButton() && interaction.customId === "gaming_unlink") {
    const member = interaction.guild?.members.cache.get(interaction.user.id);
    if (!member) return;

    const roleNames = ["PlayStation", "Xbox"];
    const removed: string[] = [];

    for (const name of roleNames) {
      const role = interaction.guild?.roles.cache.find((r) => r.name === name);
      if (role && member.roles.cache.has(role.id)) {
        await member.roles.remove(role).catch(() => {});
        removed.push(name);
      }
    }

    await interaction.reply({
      content: removed.length > 0
        ? `✅ Ton compte gaming a été déconnecté (rôle **${removed.join(", ")}** retiré).`
        : `ℹ️ Tu n'as aucun compte gaming à déconnecter.`,
      ephemeral: true,
    });
    return;
  }

  // Bouton Link Gaming → ouvre le modal avec 2 champs
  if (interaction.isButton() && interaction.customId === "gaming_link") {
    const modal = new ModalBuilder()
      .setCustomId("modal_gaming_link")
      .setTitle("Link Your Gaming Account");

    const pseudoInput = new TextInputBuilder()
      .setCustomId("pseudo")
      .setLabel("GamerTag/PSNID")
      .setPlaceholder("Enter your GamerTag or PSN ID")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(32);

    const consoleInput = new TextInputBuilder()
      .setCustomId("console")
      .setLabel("Console (Xbox or PlayStation)")
      .setPlaceholder("Type 'xbox' or 'playstation'")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(20);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(pseudoInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(consoleInput),
    );

    await interaction.showModal(modal);
    return;
  }

  // Soumission du modal gaming
  if (interaction.isModalSubmit() && interaction.customId === "modal_gaming_link") {
    const pseudo = interaction.fields.getTextInputValue("pseudo");
    const consoleRaw = interaction.fields.getTextInputValue("console").toLowerCase().trim();

    const isPs = consoleRaw.includes("playstation") || consoleRaw === "ps" || consoleRaw === "psn";
    const isXbox = consoleRaw.includes("xbox");

    if (!isPs && !isXbox) {
      await interaction.reply({
        content: `❌ Console non reconnue. Tape **xbox** ou **playstation**.`,
        ephemeral: true,
      });
      return;
    }

    const roleName = isPs ? "PlayStation" : "Xbox";
    const member = interaction.guild?.members.cache.get(interaction.user.id);
    const role = interaction.guild?.roles.cache.find((r) => r.name === roleName);

    if (!member) return;

    if (role) {
      await member.roles.add(role).catch(() => {});
    }

    await interaction.reply({
      content: `✅ Pseudo **${pseudo}** enregistré sur **${roleName}** !${role ? ` Le rôle **${roleName}** t'a été attribué.` : ""}`,
      ephemeral: true,
    });
    return;
  }

  if (!interaction.isButton()) return;

  if (interaction.customId === "role_eu_clan" || interaction.customId === "role_eu_event") {
    const roleName = interaction.customId === "role_eu_clan" ? "EU Clan" : "EU Event";
    try {
      const member = interaction.guild?.members.cache.get(interaction.user.id);
      if (!member) return;

      const role = interaction.guild?.roles.cache.find((r) => r.name === roleName);
      if (!role) {
        await interaction.reply({ content: `❌ Le rôle **${roleName}** est introuvable.`, ephemeral: true });
        return;
      }

      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role);
        await interaction.reply({ content: `✅ Le rôle **${roleName}** t'a été retiré.`, ephemeral: true });
      } else {
        await member.roles.add(role);
        await interaction.reply({ content: `✅ Tu as obtenu le rôle **${roleName}** !`, ephemeral: true });
      }
    } catch (err) {
      logger.error({ err }, "Failed to toggle clan role");
      await interaction.reply({ content: "❌ Erreur lors de la modification du rôle.", ephemeral: true });
    }
    return;
  }

  if (interaction.customId === "role_cyrex_membre") {
    try {
      const member = interaction.guild?.members.cache.get(interaction.user.id);
      if (!member) return;

      const role = interaction.guild?.roles.cache.find(
        (r) => r.name === CYREX_MEMBRE_ROLE_NAME
      );

      if (!role) {
        await interaction.reply({
          content: `❌ Le rôle **${CYREX_MEMBRE_ROLE_NAME}** est introuvable sur ce serveur.`,
          ephemeral: true,
        });
        return;
      }

      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role);
        await interaction.reply({
          content: `✅ Le rôle **${CYREX_MEMBRE_ROLE_NAME}** t'a été retiré.`,
          ephemeral: true,
        });
      } else {
        await member.roles.add(role);
        await interaction.reply({
          content: `✅ Tu as obtenu le rôle **${CYREX_MEMBRE_ROLE_NAME}** !`,
          ephemeral: true,
        });
      }
    } catch (err) {
      logger.error({ err }, "Failed to toggle role");
      await interaction.reply({
        content: "❌ Erreur lors de la modification du rôle.",
        ephemeral: true,
      });
    }
  }

  if (interaction.customId === "ticket") {
    try {
      const guild = interaction.guild!;
      const channel = await guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
            ],
          },
          {
            id: client.user!.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.ManageChannels,
            ],
          },
        ],
      });

      const closeButton = new ButtonBuilder()
        .setCustomId("close_ticket")
        .setLabel("🔒 Fermer le ticket")
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(closeButton);

      await (channel as TextChannel).send({
        content: `👋 ${interaction.user}, explique ton problème !\n\nUne fois résolu, clique sur le bouton pour fermer le ticket.`,
        components: [row],
      });

      await interaction.reply({ content: "✅ Ticket créé !", ephemeral: true });
    } catch (err) {
      logger.error({ err }, "Failed to create ticket channel");
      await interaction.reply({
        content: "❌ Erreur lors de la création du ticket.",
        ephemeral: true,
      });
    }
  }

  if (interaction.customId === "close_ticket") {
    try {
      const channel = interaction.channel as TextChannel;
      const logsChannelId = "1495298269914595338";
      const logsChannel = interaction.guild?.channels.cache.get(logsChannelId) as TextChannel | undefined;

      if (logsChannel) {
        await logsChannel.send(
          `🔒 **Ticket fermé**\n` +
          `📁 Salon : \`${channel.name}\`\n` +
          `👤 Fermé par : ${interaction.user}\n` +
          `🕐 Date : <t:${Math.floor(Date.now() / 1000)}:F>`
        );
      }

      await channel.send("🔒 Ticket fermé. Le salon va être supprimé dans 5 secondes...");
      await interaction.reply({ content: "✅ Fermeture en cours...", ephemeral: true });

      setTimeout(async () => {
        try {
          await channel.delete("Ticket fermé");
        } catch (err) {
          logger.error({ err }, "Failed to delete ticket channel");
        }
      }, 5000);
    } catch (err) {
      logger.error({ err }, "Failed to close ticket");
      await interaction.reply({
        content: "❌ Erreur lors de la fermeture du ticket.",
        ephemeral: true,
      });
    }
  }
});

export function startBot() {
  client.login(token).catch((err) => {
    logger.error({ err }, "Failed to login Discord bot");
    process.exit(1);
  });
}
