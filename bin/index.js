#!/usr/bin/env node

require('colors.ts');
const exc = require('child_process').exec;
const inquirer = require('inquirer');
const inquirerFileTreeSelectionPrompt = require('inquirer-file-tree-selection-prompt');
const join = require('path').join;
const cliui = require('cliui');

const defaultCommand = Object.freeze(['rclone']);
const defaultFlags = Object.freeze([
    '--drive-chunk-size=128M',
    '--buffer-size=64M',
    '--verbose',
    '--fast-list',
]);

const logFolder = 'F:\\rclone\\uploadLogs';
const logFile = `rclone-uploader-${Date.now()}.log`;

const methods = ['copy', 'move'];

inquirer.registerPrompt('file-tree-selection', inquirerFileTreeSelectionPrompt);

const exec = cmd =>
    new Promise((resolve, reject) => {
        exc(cmd, (err, stdout, stderr) => {
            err ? reject({ err, stdout, stderr }) : resolve({ err, stdout, stderr });
        });
    });

const getRemotes = () =>
    new Promise(resolve => {
        exec('rclone listremotes').then(({ stdout }) => resolve(stdout.trim().split('\n')));
    });

async function main(providedPath) {
    console.clear();

    const source =
        providedPath ??
        (
            await inquirer.prompt([
                {
                    type: 'file-tree-selection',
                    name: 'source',
                    message: 'Pick a file or folder to upload',
                },
            ])
        ).source;
    providedPath && console.log('\n ', 'Source:'.bold, providedPath.cyan);

    const { remote, method, bwLimit, dest } = await inquirer.prompt([
        {
            type: 'list',
            name: 'remote',
            message: 'Pick a remote:',
            choices: await getRemotes(),
        },
        {
            type: 'input',
            name: 'dest',
            message: 'Destination folder:',
            default: () => 'upload',
            filter: dest => dest.trim(),
            validate: dest =>
                dest.trim() ? true : "Cannot be blank - use '/' to upload to root directory",
        },
        {
            type: 'list',
            name: 'method',
            message: 'Upload method:',
            choices: methods,
        },
        {
            type: 'input',
            name: 'bwLimit',
            message: 'Upload speed limit (0 for unlimited)',
            default: () => '0',
            validate: limit => (/^\d+(b|k|M|G)?$/.exec(limit) ? true : 'syntax: [num](b|k|M|G)'),
        },
    ]);

    const command = [...defaultCommand, method, `"${source}"`, `"${join(remote, dest)}"`];
    const flags = [
        ...defaultFlags,
        method == 'copy' ? '--create-empty-src-dirs' : '--delete-empty-src-dirs',
        `--bwlimit=${bwLimit}`,
    ];

    inquirer
        .prompt([
            {
                type: 'confirm',
                name: 'canContinue',
                message: 'Start dry run?',
                default: true,
            },
        ])
        .then(({ canContinue }) => {
            canContinue ? upload(command, flags, true) : console.clear() || main();
        });
}

function upload(command, flags, dryRun) {
    const ui = cliui({ width: 80 });
    ui.div(
        `      command:\t  ${command.join(' ').cyan}\n` +
            // eslint-disable-next-line prettier/prettier
            `       dryRun:\t  ${dryRun ? 'true'.yellow : 'false'.red}\n` +
            // eslint-disable-next-line prettier/prettier
            `        flags:\t  ${[...flags, `--log-file=${join(logFolder, logFile)}`].join(' ').cyan}\n` +
            // eslint-disable-next-line prettier/prettier
            `       source:\t  ${command[2].cyan}\n` +
            // eslint-disable-next-line prettier/prettier
            `  destination:\t  ${command[3].cyan}\n`
    );

    console.clear();
    console.log(
        ''.padStart(5),
        'rclone-uploader'.bold,
        `[${command[3].replace(/"/g, '').grey(14)}]`
    );
    console.log(''.padStart(3), ''.padEnd(22 + command[3].length, '-'));
    console.log(ui.toString());

    const cmd = `${command.join(' ')} ${flags.join(' ')} ${
        dryRun ? '--dry-run' : `--log-file=${join(logFolder, logFile)}`
    }`;

    console.log(
        ' >> '.grey(14),
        command[0].yellow,
        command[1].magenta,
        command[2].grey(14),
        command[3].grey(14),
        ...flags.map(cmd => (cmd == '--dry-run' ? cmd.yellow : cmd.cyan)),
        dryRun ? '--dry-run'.yellow : `--log-file=${join(logFolder, logFile)}`.cyan
    );

    exec(cmd)
        .then(cp => {
            console.log();
            if (cp.error) console.error(cp.error);
            if (cp.stdout) console.log(cp.stdout);
            if (cp.stderr) console.log(cp.stderr);
            if (dryRun) {
                inquirer
                    .prompt([
                        {
                            type: 'confirm',
                            name: 'canContinue',
                            message: 'Continue?',
                            default: false,
                        },
                    ])
                    .then(({ canContinue }) => upload(command, flags, !canContinue))
                    .catch(err => console.log('prompt err:', err));
            } else {
                exec(`tail ${join(logFolder, logFile)}`)
                    .then(cp => {
                        console.log();
                        if (cp.error) console.error(cp.error);
                        if (cp.stdout) console.log(cp.stdout);
                        if (cp.stderr) console.log(cp.stderr);
                    })
                    .catch(err => console.log('tail err:', err));
            }
        })
        .catch(err => console.log('cmd err:', err));
}

main(process.argv[2]);
