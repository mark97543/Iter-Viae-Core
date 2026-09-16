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
        "type": "text"
      },
      {
        "name": "user",
        "type": "text"
      },
      {
        "name": "shared",
        "type": "json",
        "options": { "maxSize": 5242880 }
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
        "name": "startDate",
        "type": "text"
      },
      {
        "name": "endDate",
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
        "name": "trip_template",
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
        "name": "waypoints",
        "type": "json",
        "options": { "maxSize": 5242880 }
      },
      {
        "name": "bookings",
        "type": "json",
        "options": { "maxSize": 5242880 }
      },
      {
        "name": "dayNotes",
        "type": "json",
        "options": { "maxSize": 5242880 }
      },
      {
        "name": "sections",
        "type": "json",
        "options": { "maxSize": 5242880 }
      },
      {
        "name": "schedule",
        "type": "json",
        "options": { "maxSize": 5242880 }
      },
      {
        "name": "reservations",
        "type": "json",
        "options": { "maxSize": 5242880 }
      },
      {
        "name": "packingList",
        "type": "json",
        "options": { "maxSize": 5242880 }
      },
      {
        "name": "notes",
        "type": "json",
        "options": { "maxSize": 5242880 }
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
