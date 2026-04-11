module.exports = {
  apps: [
    {
      name: "kvault-backend",
      script: "apps/backend/dist/main.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "kvault-worker",
      script: "apps/worker/dist/main.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "3G",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
