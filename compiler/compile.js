import { loadAction, working } from "./loadAction";
import menus from "../actions/menus";
import conditions from "../actions/conditions";
import syntaxes from "../actions/syntax";

let macros = [];

export function isImporting() {
	return working();
}

export default (fileName) => {
	try {
	let importText;
	if (FileLib.exists(`./config/ChatTriggers/modules/HTSL/imports/${fileName}.htsl`)) {
		importText = FileLib.read(`./config/ChatTriggers/modules/HTSL/imports/${fileName}.htsl`);
	} else {
		return ChatLib.chat(`&3[HTSL] &cCouldn't find the file "&f${fileName}&c", please make sure it exists!`);
	}
	macros = [];
	ChatLib.chat("&3[HTSL] &fCompiling . . .");
	let importActions = importText.split("\n");
	let multilineComment = false;
	let multilineAction;
	let actionobj = [];
	let currentContext = { context: "DEFAULT", contextTarget: {} };
	let actionList = [];
	let depth = 0;
	let lineOffset = 0;
	let multiLineOffset = 0;
	for (let i = 0; i < importActions.length; i++) {
		if (importActions[i].trim() == "") continue;
		let args = getArgs(importActions[i].trim());
		if (typeof args == "boolean" && !args) { return ChatLib.chat(`&3[HTSL] &cSomething went wrong with expression evaluation on &eline ${i + 1 - lineOffset}`); }
		let keyword = args.shift();
		if (keyword.startsWith("//")) continue;
		if (keyword == "/*" && !multilineAction) {
			multilineComment = true;
			continue;
		}
		if (keyword == "*/" && !multilineAction) {
			if (!multilineComment) return ChatLib.chat(`&3[HTSL] &cBroken multiline comment on line &e${i + 1 - lineOffset}`);
			multilineComment = false;
			continue;
		}

		// random action
		if (args.join(" ").match(/{/) && keyword == "random") {
			multilineAction = "random {";
			continue;
		}
		// if action
		if (args.join(" ").match(/(and|or|true|false)? ?(.*) {/) && keyword == "if") {
			multilineAction = importActions[i];
			continue;
		}
		if (args.join(" ").match(/else {/)) {
			multilineAction += "\n} else {";
			continue;
		}
		// loop
		if (args.join(" ").match(/\d+ (.*) {/) && keyword == "loop" && !multilineAction) {
			multilineAction = importActions[i];
			continue;
		} else if (args.join(" ").match(/\d+ (.*) {/) && keyword == "loop") {
			depth++;
		}

		// close multiline action
		if (multilineAction && keyword == "}") {
			if (depth != 0) {
				depth--;
				multilineAction += `\n${importActions[i].trim()}`;
				continue;
			}
			importActions[i] = multilineAction + "\n}";
			args = getMultiline(multilineAction + "\n}").filter(n => n && n != "else");
			if (!multilineAction.match(/if (and|or|true|false) ([\s\S]*)/) && multilineAction.startsWith("if")) {
				args.splice(1, 0, "and");
			}
			if (multilineAction.match(/if (and|or|true|false)? ?\(\) {([\s\S]*)/) && multilineAction.startsWith("if")) {
				// blank conditions
				args.splice(2, 0, "");
			}
			keyword = args.shift();
			// loop again
			if (keyword == "loop") {
				lineOffset += 2;
				try {
					let newLines = handleLoop(multilineAction);
					lineOffset += newLines.length;
					importActions.splice(i + 1, 0, ...newLines);
				} catch (e) {
					return ChatLib.chat(`&3[HTSL] &cSomething went wrong with your loop...`);
				}
				multilineAction = undefined;
				continue;
			}
			multilineAction = undefined;
		}

		if (multilineComment) continue;

		if (keyword == "define") {
			if (syntaxes[args[0]] || ["goto", "//", "/*", "*/", "loop"].includes(args[0])) return ChatLib.chat(`&3[HTSL] &cInvalid macro name &e${args[0]}`);
			if (macros.find(macro => macro.name == args[0])) return ChatLib.chat(`&3[HTSL] &cCannot have two macros of the same name!`);
			macros.push({
				name: args.shift(),
				value: args.join(" ")
			});
			continue;
		}

		if (multilineAction) {
			multilineAction += `\n${importActions[i].trim()}`;
			multiLineOffset++;
			continue;
		}
		if (keyword == "goto") {
			actionobj.push({
				context: currentContext.context,
				contextTarget: currentContext.contextTarget,
				actions: actionList
			});
			actionList = [];
			currentContext = {
				context: args[0].toUpperCase(),
				contextTarget: { name: args[1] },
			}
			continue;
		}
		if (syntaxes.actions[keyword]) {
			let syntax = syntaxes.actions[keyword];
			let comp = componentFunc(args, syntax, menus[syntax.type]);
			if (typeof comp == "string") {
				return ChatLib.chat(`&3[HTSL] &c${comp.replace("{line}", i - lineOffset - multiLineOffset)}`);
			}
			if (comp) {
				actionList.push(comp);
			} else {
				return ChatLib.chat(`&3[HTSL] &cUnknown action &e${keyword}&c on &eline ${i - lineOffset - multiLineOffset}`);
			}
		} else {
			return ChatLib.chat(`&3[HTSL] &cUnknown action &e${keyword}&c on &eline ${i - lineOffset - multiLineOffset}`);
		}
		multiLineOffset = 0;
	}
	actionobj.push({
		context: currentContext.context,
		contextTarget: currentContext.contextTarget,
		actions: actionList
	});
	if (multilineAction) return ChatLib.chat(`&3[HTSL] &cBroken multiline action`);

	if (!loadAction(actionobj)) return false;
	} catch (error) {
		ChatLib.chat(`&3[HTSL] &eEncountered an unknown error, please seek support about the following error:`);
		ChatLib.chat(error);
		console.error(error);
	}
}

function getArgs(input) {
	let conversions = [
        { regex: /(=|>|<|set|dec|mult|div|ment|inc|multiply|divide|equal|Less Than|Less Than or Equal|Greater Than|Greater Than or Equal) +globalstat +(.*)?/g, replacement: "$1 %stat.global/$2%" },
        { regex: /(=|>|<|set|dec|mult|div|ment|inc|multiply|divide|equal|Less Than|Less Than or Equal|Greater Than|Greater Than or Equal) +stat +(.*)?/g, replacement: "$1 %stat.player/$2%" },
        { regex: /(=|>|<|set|dec|mult|div|ment|inc|multiply|divide|equal|Less Than|Less Than or Equal|Greater Than|Greater Than or Equal) +teamstat +(.*)? +?(.*)?/g, replacement: "$1 %stat.team/$2 $3%" },
        { regex: /(=|>|<|set|dec|mult|div|ment|inc|multiply|divide|equal|Less Than|Less Than or Equal|Greater Than|Greater Than or Equal) +randomint +(.*)? +?(.*)?/g, replacement: "$1 %random.int/$2 $3%" },
        { regex: /(=|>|<|set|dec|mult|div|ment|inc|multiply|divide|equal|Less Than|Less Than or Equal|Greater Than|Greater Than or Equal) +health/g, replacement: "$1 %player.health%" },
        { regex: /(=|>|<|set|dec|mult|div|ment|inc|multiply|divide|equal|Less Than|Less Than or Equal|Greater Than|Greater Than or Equal) +maxHealth/g, replacement: "$1 %player.maxhealth%" },
        { regex: /(=|>|<|set|dec|mult|div|ment|inc|multiply|divide|equal|Less Than|Less Than or Equal|Greater Than|Greater Than or Equal) +hunger/g, replacement: "$1 %player.hunger%" },
        { regex: /(=|>|<|set|dec|mult|div|ment|inc|multiply|divide|equal|Less Than|Less Than or Equal|Greater Than|Greater Than or Equal) +locX/g, replacement: "$1 %player.location.x%" },
        { regex: /(=|>|<|set|dec|mult|div|ment|inc|multiply|divide|equal|Less Than|Less Than or Equal|Greater Than|Greater Than or Equal) +locY/g, replacement: "$1 %player.location.y%" },
        { regex: /(=|>|<|set|dec|mult|div|ment|inc|multiply|divide|equal|Less Than|Less Than or Equal|Greater Than|Greater Than or Equal) +locZ/g, replacement: "$1 %player.location.z%" },
        { regex: /(=|>|<|set|dec|mult|div|ment|inc|multiply|divide|equal|Less Than|Less Than or Equal|Greater Than|Greater Than or Equal) +unix/g, replacement: "$1 %date.unix%" }
    ];
	for (let conversion of conversions) {
        input = input.replace(conversion.regex, conversion.replacement);
    }

	let result = [];
	let match;
	let re = /"((?:\\"|[^"])*)"|{((?:\\{|[^}])*)}|(\S+)/g;
	while ((match = re.exec(input)) !== null) {
		let arg = match[1] || match[2] || match[3];
		// Check if the argument is not in quotes or curly brackets
		if (!match[1] && !match[2]) {
			// macros
			let macro = macros.find(m => m.name === arg);
			if (macro) {
				arg = getArgs(macro.value);
				result.push(...arg);
				continue;
			}
			// null handling
			if (arg == "null") {
				arg = null;
			}
			// slot choice for items
			let slotMatch = arg.match(/slot\_(\d+)/)
			if (slotMatch) {
				arg = { slot: Number(slotMatch[1]) };
			}
		} else if (match[2]) {
			// If the argument is in curly brackets
			macros.forEach((macro) => {
				arg = arg.replace(macro.name, macro.value);
			});
			try {
				result.push(evaluateExpression(arg));
			} catch (e) {
				return false;
			}
		}
		result.push(arg);
	}
	return result;
}

function parseExpression(expression) {
	let operators = {
		'+': { precedence: 1, func: (a, b) => a + b },
		'-': { precedence: 1, func: (a, b) => a - b },
		'*': { precedence: 2, func: (a, b) => a * b },
		'/': { precedence: 2, func: (a, b) => a / b },
		'^': { precedence: 3, func: (a, b) => Math.pow(a, b) }
	};

	let outputQueue = [];
	let operatorStack = [];
	let tokens = expression.match(/(\d+|\+|-|\*|\/|\^|\(|\))/g);

	tokens.forEach(token => {
		if (!isNaN(token)) {
			outputQueue.push(parseFloat(token));
		} else if (token in operators) {
			while (operatorStack.length > 0 && operators[token].precedence <= operators[operatorStack[operatorStack.length - 1]].precedence) {
				let op = operators[operatorStack.pop()];
				let [b, a] = [outputQueue.pop(), outputQueue.pop()];
				outputQueue.push(op.func(a, b));
			}
			operatorStack.push(token);
		} else if (token === '(') {
			operatorStack.push(token);
		} else if (token === ')') {
			while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
				let op = operators[operatorStack.pop()];
				let [b, a] = [outputQueue.pop(), outputQueue.pop()];
				outputQueue.push(op.func(a, b));
			}
			if (operatorStack.length > 0) {
				operatorStack.pop();  // Pop the '('
			}
		}
	});

	while (operatorStack.length > 0) {
		let op = operators[operatorStack.pop()];
		let [b, a] = [outputQueue.pop(), outputQueue.pop()];
		outputQueue.push(op.func(a, b));
	}

	return outputQueue.pop();
}

function evaluateExpression(expression) {
	// Split the expression into parts
	let parts = expression.split('+').map(part => part.trim());

	// Process each part
	let result = '';
	let numberBuffer = null;
	for (let part of parts) {
		// Check if part is an array access (e.g., ["hello", "test 1"][1])
		if (part.startsWith('[') && part.includes('][')) {
			let arrayMatch = part.match(/\[(.*?)\]\[(.*?)\]/);
			if (arrayMatch) {
				let array = JSON.parse('[' + arrayMatch[1] + ']');
				let index = parseExpression(arrayMatch[2]);
				result += (numberBuffer !== null ? numberBuffer : '') + array[index];
				numberBuffer = null;
			}
		}

		// Check if part is a number
		else if (!isNaN(part)) {
			numberBuffer = (numberBuffer !== null ? numberBuffer : 0) + parseInt(part);
		}

		// Otherwise, assume part is a string and remove quotes
		else {
			result += (numberBuffer !== null ? numberBuffer : '') + part.replace(/['"]/g, '');
			numberBuffer = null;
		}
	}

	return result + (numberBuffer !== null ? numberBuffer : '');
}

function getMultiline(input) {
	let result = [];
	let match;
	let re = /\(([^()]*(?:"[^"]*"[^()]*)*)\)|\{([^}]*)\}|(\S+)/g;
	while ((match = re.exec(input)) !== null) {
		result.push(match[1] || match[2] || match[3]);
	}
	return result;
}

function validOperator(operator) {
	switch (operator) {
		case "inc":
		case "+=":
			operator = "increment";
			break;
		case "dec":
		case "-=":
			operator = "decrement";
			break;
		case "=":
			operator = "set";
			break;
		case "mult":
		case "*=":
			operator = "multiply";
			break;
		case "div":
		case "/=":
		case "//=":
			operator = "divide";
			break;
	}
	if (!['increment', 'decrement', 'set', 'multiply', 'divide'].includes(operator.toLowerCase())) return `Unknown operator &e${operator}&c on &eline {line}`;
	return operator.toUpperCase();
}

function validComparator(comparator) {
	switch (comparator.toLowerCase()) {
		case "=":
		case "==":
		case "equal":
			comparator = "EQUAL";
			break;
		case "<":
			comparator = "Less Than";
			break;
		case "=<":
		case "<=":
			comparator = "Less Than or Equal";
			break;
		case ">":
			comparator = "Greater Than";
			break;
		case "=>":
		case ">=":
			comparator = "Greater Than or Equal";
			break;
	}
	if (!["EQUAL", "Less Than", "Less Than or Equal", "Greater Than", "Greater Than or Equal"].includes(comparator)) return `Unknown comparator &e${comparator}&c on &eline {line}`;
	return comparator;
}

function componentFunc(args, syntax, menu) {
	let params = [];
	if (syntax.full.match(/\<(.*?)\>/g)) params = syntax.full.match(/\<(.*?)\>/g).map(n => n.substring(1, n.length - 1));
	let component = { type: syntax.type };
	for (let j = 0; j < params.length; j++) {
		if (!args[j]) continue;
		// handle operator aliases
		if (menu[params[j]].type == "static_option_select" && menu[params[j]].options?.includes("Increment")) {
			args[j] = validOperator(args[j]);
			if (args[j].match(/Unknown operator(.*)/)) return args[j];
		}
		// handle comparator aliases
		if (menu[params[j]].type == "static_option_select" && menu[params[j]].options?.includes("Less Than")) {
			args[j] = validComparator(args[j]);
			if (args[j].match(/Unknown comparator(.*)/)) return args[j];
		}
		// handle custom location location type
		if (menu[params[j]].type == "location") {
			if (!["house_spawn", "current_location", "invokers_location", "custom_coordinates"].includes(args[j].toLowerCase().replace(" ", "_"))) return `Invalid location &e${args[j]}&c on &eline {line}`;
			if (args[j].toLowerCase().replace(" ", "_") == "custom_coordinates") {
				args[j] = {
					type: "custom_coordinates",
					coords: args[j + 1]
				}
			} else args[j] = { type: args[j] }
		}
		// handle toggles
		if (menu[params[j]].type == "toggle") {
			if (["or", "true"].includes(args[j])) {
				args[j] = true
			} else {
				args[j] = false;
			}
		}
		// handle items
		if (menu[params[j]].type == "item") {
			if (typeof args[j] == "object") {
				args[j].type = "clickSlot";
			} else {
				if (!FileLib.exists("HTSL", `imports/${args[j]}.json`)) return `Unknown item &e${args[j]}&c on &eline {line}`;
				args[j] = JSON.parse(FileLib.read("HTSL", `imports/${args[j]}.json`));
				args[j].type = "customItem";
			}
		}
		// handle conditions w/ recursion
		if (menu[params[j]].type == "conditions") {
			let conditionsArg = args[j].split(",");
			let conditionList = [];
			for (let i = 0; i < conditionsArg.length; i++) {
				let conditionArgs = getArgs(conditionsArg[i].trim());
				let keyword = conditionArgs.shift();
				if (keyword == "" || !keyword) continue;
				if (syntaxes.conditions[keyword]) {
					let subsyntax = syntaxes.conditions[keyword];
					let comp = componentFunc(conditionArgs, subsyntax, conditions[subsyntax.type]);
					if (typeof comp == "string") return comp;
					if (comp) {
						conditionList.push(comp);
					} else {
						return `Unknown condition &e${args[j]}&c on &eline {line}`;
					}
				} else {
					return `Unknown condition &e${args[j]}&c on &eline {line}`;
				}
			}
			args[j] = conditionList;
		}
		// handle subactions w/ recursion
		if (menu[params[j]].type == "subactions") {
			let subactions = [];
			let lines = args[j].split("\n");
			for (let i = 0; i < lines.length; i++) {
				let subargs = getArgs(lines[i]);
				let keyword = subargs.shift();
				if (keyword == "" || !keyword) continue;
				if (syntaxes.actions[keyword]) {
					let subsyntax = syntaxes.actions[keyword];
					let comp = componentFunc(subargs, subsyntax, menus[subsyntax.type]);
					if (typeof comp == "string") return comp;
					if (comp) {
						subactions.push(comp);
					} else {
						return `Unknown action &e${args[j]}&c on &eline {line}`;
					}
				} else {
					return `Unknown condition &e${args[j]}&c on &eline {line}`;
				}
			}
			args[j] = subactions;
		}

		component[params[j]] = args[j];
	}
	return component;
}

function handleLoop(string) {
    let [match, length, indexName] = string.split("\n")[0].match(/loop (\d+) (.*) {(\s*|\S*)*/);
    if (macros.find(macro => macro.name == indexName)) throw {};
	let newLines = [];
    for (let i = 1; i <= Number(length); i++) {
        let loopLines = string.replace(new RegExp(`(\\b${indexName}\\b)|("${indexName}")`, "g"), (match, p1, p2) => {
            if (p2) {
                // If indexName is part of a string, don't replace it
                return p2;
            } else {
                // Otherwise, replace indexName with i
                return i - 1;
            }
        }).split("\n");
        loopLines.shift();
        newLines.push(...loopLines);
    }
    return newLines;
}