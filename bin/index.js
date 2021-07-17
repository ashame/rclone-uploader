#!/usr/bin/env node

const inquirer = require('inquirer');
const inquirerFileTreeSelectionPrompt = require('inquirer-file-tree-selection-prompt');
const exc = require('child_process').exec;
const join = require('path').join;

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
    providedPath && console.log('source:', providedPath);

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

    const command = [...defaultCommand, method, source, join(remote, dest)];
    const flags = [
        ...defaultFlags,
        method == 'copy' ? '--create-empty-src-dirs' : '--delete-empty-src-dirs',
        `--bwlimit=${bwLimit}`,
    ];

    console.log({
        source,
        dest: join(remote, dest),
        method,
        bwLimit,
        command: command.join(' '),
        flags,
    });

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
    console.clear();
    console.log();
    console.log(''.padStart(5), 'rclone-uploader', `[${command[3]}]`);
    console.log(''.padStart(3), ''.padEnd(22 + command[3].length, '-'));
    console.log(''.padStart(5), 'command: '.padStart(9), command.join(' '));
    console.log(''.padStart(5), 'dryRun: '.padStart(9), dryRun);
    console.log(
        ''.padStart(5),
        'flags: '.padStart(9),
        [...flags, `--log-file=${join(logFolder, logFile)}`].join(' ')
    );
    console.log(''.padStart(5), 'src: '.padStart(9), command[2]);
    console.log(''.padStart(5), 'dest: '.padStart(9), command[3]);
    console.log();

    const cmd = `${command.join(' ')} ${flags.join(' ')} ${
        dryRun ? '--dry-run' : `--log-file=${join(logFolder, logFile)}`
    }`;

    console.log('\n > ', cmd);

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
