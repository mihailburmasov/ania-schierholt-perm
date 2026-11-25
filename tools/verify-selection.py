import json, pathlib, pymupdf
root=next(pathlib.Path('D:/Claude').rglob('Ольга Пермь Одежда/Каталоги/Новые каталоги'))
names={'ss23':'AS_Lookbook_26_Freigabepdf*.pdf','aw23':'Notes_261019_122503.pdf','aw24':'Notes_261019_124824.pdf','aw25':'Ширхольд зима 2026*.pdf','aw26':'Ширхольт каталог зима 2027*.pdf'}
items=json.loads(pathlib.Path('data/stock-selection.json').read_text(encoding='utf-8'))['items']
docs={key:pymupdf.open(next(root.glob(pattern))) for key,pattern in names.items()}
print('Позиций:',len(items))
for item in items:
    key=item['photo'].split('/')[0]
    text=docs[key][item['page']-1].get_text()
    path=pathlib.Path('_source/raw')/(item['photo']+'.jpg')
    issues=[]
    if item['article'] not in text: issues.append('артикул не найден на странице')
    if not path.exists(): issues.append('фото не найдено')
    if issues: print(item['article'],key,item['page'],', '.join(issues))
