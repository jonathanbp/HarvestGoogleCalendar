coffee -b -o bin -c lib/harvestgoogle.coffee
echo "#!/usr/bin/env node" > bin/tmp
cat bin/harvestgoogle.js >> bin/tmp
mv bin/tmp bin/harvestgoogle.js