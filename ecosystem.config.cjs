module.exports = {
    apps: [{
        name: "vfs-automation",
        script: "./src/loop-runner.ts",
        interpreter: "node",
        interpreter_args: "--import tsx/esm",
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '1G',
        env: {
            NODE_ENV: "production",
            HEADLESS: "true"
        },
        error_file: "./logs/err.log",
        out_file: "./logs/out.log",
        time: true
    }]
};
