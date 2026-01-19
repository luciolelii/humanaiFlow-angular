export const flowTest = {
    "id": "testFlow",
    "createdBy": "lucio.lelii",
    "name": "Test Flow",
    "description": "This is a test flow",
    "nodes": [
        {
            "key": "1328196f-5ddd-43b0-a702-2d1376970c70",
            "name": "Input Node",
            "position": null,
            "parameters": null,
            "nodeDefinition": {
                "category": "Input",
                "runtimeParameters": null,
                "fixedParameters": null,
                "inputs": {},
                "outputs": {
                    "phrase": {
                        "type": "TEXT",
                        "multiple": false
                    }
                },
                "simulable": false,
                "name": "Phrase"
            }
        },
        {
            "key": "f142511e-f410-4974-9354-3a1e056e056f",
            "name": "translator to french",
            "position": null,
            "parameters": {
                "LLMProvider": "OllamaTestProvider",
                "LLMModel": "sam860/gemma3:270m"
            },
            "nodeDefinition": {
                "category": "Execution",
                "executor": "genericAIExecutorTest",
                "inputMappers": {
                    "prompt": {
                        "type": "translator",
                        "translation": "translate the following phrase : \"${{phrase}}\" in french, return only the translation"
                    }
                },
                "outputMappers": {
                    "translated": {
                        "type": "direct",
                        "fieldName": "response"
                    }
                },
                "name": "French Translator",
                "runtimeParameters": null,
                "fixedParameters": null,
                "inputs": {
                    "phrase": {
                        "type": "TEXT",
                        "multiple": false
                    }
                },
                "outputs": {
                    "translated": {
                        "type": "TEXT",
                        "multiple": false
                    }
                }
            }
        },
        {
            "key": "e3488c96-b55b-4763-bc25-54d3d3755d85",
            "name": "Output Node",
            "position": null,
            "parameters": null,
            "nodeDefinition": {
                "category": "Output",
                "runtimeParameters": null,
                "fixedParameters": null,
                "outputs": {},
                "inputs": {
                    "translated": {
                        "type": "TEXT",
                        "multiple": false
                    }
                },
                "name": "Translated Phrase"
            }
        }
    ],
    "connections": [
        {
            "key": "18739497-51e6-4d09-be40-398c3601a326",
            "from": "1328196f-5ddd-43b0-a702-2d1376970c70:phrase",
            "to": "f142511e-f410-4974-9354-3a1e056e056f:phrase"
        },
        {
            "key": "f88d9442-4a9f-4b4b-ac3f-9794dd0bf6db",
            "from": "f142511e-f410-4974-9354-3a1e056e056f:translated",
            "to": "e3488c96-b55b-4763-bc25-54d3d3755d85:translated"
        }
    ],
    "public": false
};
