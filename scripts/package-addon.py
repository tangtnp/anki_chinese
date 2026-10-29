from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
with ZipFile('public/hanzi-flow.ankiaddon','w',ZIP_DEFLATED) as archive:
    for path in Path('anki-addon').glob('*'):
        if path.is_file() and path.suffix in ('.py','.json'): archive.write(path,path.name)
print('Packaged public/hanzi-flow.ankiaddon')
