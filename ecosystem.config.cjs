module.exports = {
  apps: [
    {
      name: "airavata-whatsapp-api",
      script: "./artifacts/api-server/dist/index.mjs",
      cwd: "/var/www/Airavata-Whatsapp-V1",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      node_args: "--enable-source-maps",
      env: {
        NODE_ENV: "production",
        PORT: "3014",

        // ── MongoDB ───────────────────────────────────────────────────────────
        MONGODB_URI: "mongodb+srv://raneaniket23_db_user:oqScJ68o1JPmvNto@airavata-whatsapp-solut.e3dj81w.mongodb.net/?appName=Airavata-Whatsapp-Solution",

        // ── Session ───────────────────────────────────────────────────────────
        SESSION_SECRET: "07O2oC0/xUfVvayY/JZuxiSxV78OiXyJUq6Jwi01lGW5qBSDuDPNYriUwnh5lV5qd4Pu21/C5CeHTjS3vxdt/Q==",

        // ── Meta / WhatsApp ───────────────────────────────────────────────────
        META_ACCESS_TOKEN: "EAAS0h8ZCJ7eIBR9DUEyTZChhRc43DyaRwCiZBzNa440O8K2OdfkpxuKnGZAKqXqdYwqfw1q7EUAW9ZBK2zpjYxXiMqsCgQZCodIa8SZAm0HsIcNLZCLAPZCYF9t3CjVQLu9u5HnBJbmLpDGrQkHTiCWPFRIZBr7ObfPepaPxsDLNrngjwAZBhFeUzVBdYvY3ZALM4aP1FwZDZD",
        META_PHONE_NUMBER_ID: "1273577662499310",
        META_WABA_ID: "1546864506819232",
        WEBHOOK_VERIFY_TOKEN: "airavata_wh_2026",
        META_APP_ID: "1324395306544610",
        META_APP_SECRET: "a8ab2b68450eda7d16c4be8462597e88",
        META_REDIRECT_URI: "https://airavataintelligence.com/",

        // ── AutoGamma integration ──────────────────────────────────────────────
        AIRAVATA_INTEGRATION_URL:
          "https://newcrm.autogamma.in/api/integrations/airavata/whatsapp-inquiries",
        // Keep the shared secret in the VPS environment, not in this tracked file.
        AIRAVATA_INTEGRATION_SECRET: process.env.AIRAVATA_INTEGRATION_SECRET,
      },
    },
  ],
};
