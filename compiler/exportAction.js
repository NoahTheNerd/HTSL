import { addOperation, forceOperation } from "../gui/Queue"
import { convertJSON } from "./convertAction";
import menus from "../actions/menus"
import conditions from "../actions/conditions"

let actionobjs;
let subactions;

function processMenu(menu, submenuItems, actionkey, callback) {
    let action = { type: actionkey };
    forceOperation({
        type: "actionOrder", func: () => {
            callback(action);
        }
    });
    for (let j = 0; j < Object.keys(menu).length; j++) {
        let key = Object.keys(menu)[j];
        if (key == "action_name" || key == "condition_name") continue;
        switch (menu[key].type) {
            case "toggle":
                action[key] = ChatLib.removeFormatting(submenuItems[menu[key].slot].getLore()[3]) == "Enabled";
                if (key == "match_any_condition") action[key] = ChatLib.removeFormatting(submenuItems[menu[key].slot].getLore()[6]) == "Enabled";
                break;
            case "location":
                if (action[key] = ChatLib.removeFormatting(submenuItems[menu[key].slot].getLore()[3]) == "Not Set") {
                    action[key] = {
                        "relZ": 1,
                        "relY": 1,
                        "relX": 1,
                        "x": 0,
                        "y": 0,
                        "z": 0,
                        "pitch": 0,
                        "yaw": 0
                    }
                } else {
                    let temp = ChatLib.removeFormatting(submenuItems[menu[key].slot].getLore()[3]).match(/(~)?(-?\d+(\.\d+)?)/g);
                    action[key] = {
                        "relZ": temp[2].includes("~") ? 1 : 0,
                        "relY": temp[1].includes("~") ? 1 : 0,
                        "relX": temp[0].includes("~") ? 1 : 0,
                        "x": temp[0].includes("~") ? temp[0].substring(1) : temp[0],
                        "y": temp[1].includes("~") ? temp[1].substring(1) : temp[1],
                        "z": temp[2].includes("~") ? temp[2].substring(1) : temp[2],
                        "pitch": temp[4] ? temp[4] : 0,
                        "yaw": temp[3] ? temp[3] : 0
                    }
                }
                break;
            case "item":
                action[key] = null;
                break;
            case "conditions":
                if (ChatLib.removeFormatting(submenuItems[menu[key].slot].getLore()[3]).match(/No Conditions/)) {
                    action[key] = null;
                } else {
                    forceOperation({
                        type: "doneSub", func: () => {
                            action[key] = subactions;
                            subactions = [];
                        }
                    });
                    forceOperation({ type: "back" });
                    forceOperation({
                        type: "export", func: (submenuItems) => {
                            subactions = [];
                            processPage(submenuItems, subactions, conditions, 0);
                        }
                    });
                    forceOperation({ type: "click", slot: menu[key].slot });
                }
                break;
            case "subactions":
                if (ChatLib.removeFormatting(submenuItems[menu[key].slot].getLore()[5]).match(/No Actions/)) {
                    action[key] = null;
                    forceOperation({
                        type: "doneSub", func: () => {
                            subactions = [];
                        }
                    });
                } else {
                    forceOperation({
                        type: "doneSub", func: () => {
                            action[key] = subactions;
                            subactions = [];
                        }
                    });
                    forceOperation({ type: "back" });
                    forceOperation({
                        type: "export", func: (submenuItems) => {
                            subactions = [];
                            processPage(submenuItems, subactions, menus, 0);
                        }
                    });
                    forceOperation({ type: "click", slot: menu[key].slot });
                }
                break;
            default:
                action[key] = ChatLib.removeFormatting(submenuItems[menu[key].slot].getLore()[3]);
                if (action[key] == "Not Set") action[key] = null;
                if (key == "ticks_to_wait") action[key] = ChatLib.removeFormatting(submenuItems[menu[key].slot].getLore()[5]);
                if (key == "team" && Object.keys(menu).length > 2) action[key] = ChatLib.removeFormatting(submenuItems[menu[key].slot].getLore()[6]);
                break;
        }
    }
}

export default (fileName) => {
    let items = Player.getContainer().getItems();
    items = items.splice(0, Player.getContainer().getSize() - 9 - 36);
    actionobjs = [];

    processPage(items, actionobjs, menus, 0);

    addOperation({
        type: "doneExport", func: () => {
            FileLib.write("HTSL", `imports/${fileName}.htsl`, convertJSON([{
                context: "DEFAULT",
                contextTarget: {},
                actions: actionobjs
            }]));
        }
    });
}

function processPage(items, actionList, menuList, page) {
    forceOperation({
        type: "donePage", func: () => {
            if (Player.getContainer().getItems()[Player.getContainer().getSize() - 37]) if (ChatLib.removeFormatting(Player.getContainer().getItems()[Player.getContainer().getSize() - 37].getName()) == "Next Page") {
                let nextItems = Player.getContainer().getItems();
                nextItems = nextItems.splice(0, Player.getContainer().getSize() - 9 - 36);
                forceOperation({
                    type: "export", func: (subMenuItems) => {
                        processPage(subMenuItems, actionList, menuList, page + 1);
                    }
                });
                forceOperation({ type: "click", slot: Player.getContainer().getSize() - 37 });
            }
        }
    });

    for (let i = items.length - 1; i >= 0; i--) {
        if (!items[i]) continue;
        let menu;
        let actionkey;
        for (let key in menuList) {
            if (menuList[key]?.condition_name== ChatLib.removeFormatting(items[i].getName())) {
                menu = menuList[key];
                actionkey = key;
                break;
            }
            if (menuList[key]?.action_name == ChatLib.removeFormatting(items[i].getName())) {
                menu = menuList[key];
                actionkey = key;
                break;
            }
        }
        if (!menu) return ChatLib.chat(`&3[HTSL] &fConnor is that you?`);
        if (Object.keys(menu).length > 1) {
            // operations forced to the front of the queue, so they need to be added backwards

            // get back on the right page
            for (let j = 0; j < page; j++) {
                forceOperation({ type: "click", slot: Player.getContainer().getSize() - 37 })
            }

            forceOperation({ type: "back" });
            forceOperation({
                type: "export", func: (submenuItems) => {
                    processMenu(menu, submenuItems, actionkey, (action) => {
                        actionList.push(action);
                    });
                }
            });
            forceOperation({ type: "click", slot: i });
        } else {
            forceOperation({
                type: "actionOrder", func: () => {
                    actionList.push({ type: actionkey });
                }
            })
        }
    }
}