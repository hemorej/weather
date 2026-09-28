$CREATE_RELEASE()

cd $FORGE_RELEASE_DIRECTORY

$PNPM_PATH install --frozen-lockfile

ln -s /mnt/$VOLUME_NAME/weatherfonts public/fonts

$PNPM_PATH build

$ACTIVATE_RELEASE()

sudo supervisorctl stop daemon-916152:daemon-916152_00

# Wait for the old process to fully release :9000 before starting the new
# one — supervisorctl restart doesn't guarantee the OS has reclaimed the
# port by the time it marks the old process STOPPED, causing an
# EADDRINUSE crash-loop until autorestart eventually wins the race.
for i in $(seq 1 15); do
  ss -ltn 2>/dev/null | grep -q ':9000 ' || break
  sleep 1
done

sudo supervisorctl start daemon-916152:daemon-916152_00
