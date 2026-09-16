migrate((db) => {
  const collection = new Collection({
    "id": "6hixvie2tgaykgy",
    "name": "trips",
    "type": "base",
    "system": false,
    "schema": [
      {
        "name": "title",
        "type": "text",
        "required": true
      },
      {
        "name": "slug",
        "type": "text",
        "required": true
      },
      {
        "name": "subtitle",
        "type": "text"
      },
      {
        "name": "destination",
        "type": "text"
      },
      {
        "name": "dates",
        "type": "text"
      },
      {
        "name": "status",
        "type": "text"
      },
      {
        "name": "coverEmoji",
        "type": "text"
      },
      {
        "name": "coverGradient",
        "type": "text"
      },
      {
        "name": "summary",
        "type": "text"
      },
      {
        "name": "sections",
        "type": "json"
      },
      {
        "name": "schedule",
        "type": "json"
      },
      {
        "name": "reservations",
        "type": "json"
      },
      {
        "name": "packingList",
        "type": "json"
      },
      {
        "name": "notes",
        "type": "json"
      }
    ],
    "listRule": "",
    "viewRule": "",
    "createRule": "",
    "updateRule": "",
    "deleteRule": ""
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("trips");
  return dao.deleteCollection(collection);
});
