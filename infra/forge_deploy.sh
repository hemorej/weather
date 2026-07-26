$CREATE_RELEASE()

cd $FORGE_RELEASE_DIRECTORY

$PNPM_PATH install --frozen-lockfile

ln -s /mnt/$VOLUME_NAME/weatherfonts public/fonts

$PNPM_PATH build

$ACTIVATE_RELEASE()

sudo supervisorctl restart daemon-916152:daemon-916152_00
