$CREATE_RELEASE()

cd $FORGE_RELEASE_DIRECTORY

npm install

ln -s /mnt/volume-tor1-01/weatherfonts public/fonts

npm run build

$ACTIVATE_RELEASE()

sudo supervisorctl restart daemon-916152:daemon-916152_00