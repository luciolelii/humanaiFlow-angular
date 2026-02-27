export const flowTest = { 
  "name" : "Test Flow",
  "description" : "This is a test flow",
  "blocks" : [ {
    "id" : "cabd6f4e-5a05-41f8-9bf7-4de20391ac4e",
    "sink" : false,
    "name" : "first",
    "inputs" : [ {
      "name" : "name",
      "type" : "TEXT",
      "multiple" : false
    } ],
    "outputs" : [ {
      "name" : "response",
      "type" : "TEXT",
      "multiple" : false
    } ],
    "specificConfiguration" : {
      "type" : "LLMBlockConfiguration",
      "name" : "first",
      "llmDescriptor" : {
        "provider" : "testProvider",
        "model" : "testModel"
      },
      "prompt" : "Make a question about ${{name}}"
    },
    "typeName" : "LLMBlock"
  }, {
    "id" : "0063a3ec-3863-4045-bd3b-61eaf87b4604",
    "sink" : true,
    "name" : "interactive",
    "inputs" : [ {
      "name" : "input",
      "type" : "TEXT",
      "multiple" : false
    } ],
    "outputs" : [ {
      "name" : "output",
      "type" : "TEXT",
      "multiple" : false
    } ],
    "specificConfiguration" : {
      "type" : "HumanInteractiveBlockConfiguration",
      "name" : "interactive",
      "actionDescription" : "Answer the question in input",
      "llmDescriptor" : {
        "provider" : "testProvider",
        "model" : "testModel"
      },
      "inputAsList" : false,
      "outputAsList" : false
    },
    "typeName" : "HumanInteractionBlock"
  } ],
  "connections" : [ {
    "id" : "8da696c2-dc03-4717-b2ce-18637ae6f7f8",
    "sourceId" : "cabd6f4e-5a05-41f8-9bf7-4de20391ac4e",
    "sourceName" : "response",
    "targetId" : "0063a3ec-3863-4045-bd3b-61eaf87b4604",
    "targetName" : "input"
  } ]
};
