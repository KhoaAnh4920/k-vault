module.exports = {
  apps: [
    {
      name: "kvault-backend",
      cwd: "./apps/backend",
      script: "dist/src/main.js",
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
      cwd: "./apps/worker",
      script: "dist/main.js",
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
