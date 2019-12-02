import json

resource = """
{
  "resourceType": "ValueSet",
  "text": {
    "status": "generated",
    "div": "<div xmlns='http://www.w3.org/1999/xhtml'>arup genetic tests<a name='mm'/></div>"
  },
  "id": "cf-1563892591909",
  "status": "draft",
  "name": "arup-genetic-tests",
  "title": "ARUP Genetic Tests",
  "experimental": true,
  "date": "2019-07-23T15:00:02.780Z",
  "publisher": "Michael Watkins",
  "compose": {
    "include": []
  },
  "system": "https://www.aruplab.com/genetics/tests"
}
"""
r = json.loads(resource)
test_list = []
with open('tests.tsv','r') as tests:
    with open('resource.json','w') as out:
        for line in tests:
            l = line.split('\t')
            code = l[0].strip()
            if code not in test_list:
                name = l[1].strip()
                entry = {'code':code,'display':name}
                r['compose']['include'].append({'concept':entry})
                test_list.append(code)
        out.write(json.dumps(r))
