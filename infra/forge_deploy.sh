$CREATE_RELEASE()

cd $FORGE_RELEASE_DIRECTORY

/home/forge/.local/share/pnpm/bin/pnpm install

ln -s /mnt/volume-tor1-01/weatherfonts public/fonts

/home/forge/.local/share/pnpm/bin/pnpm build

$ACTIVATE_RELEASE()

sudo supervisorctl restart daemon-916152:daemon-916152_00
