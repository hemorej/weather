$CREATE_RELEASE()

cd $FORGE_RELEASE_DIRECTORY

npm install
npm run build

ln -s /mnt/volume-tor1-01/weatherfonts public/fonts

$ACTIVATE_RELEASE()

sudo supervisorctl restart daemon-916152:daemon-916152_00