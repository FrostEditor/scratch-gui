import {parseTextToNodes, nodesToText} from './tmp_twfmt.mjs';

function norm (nodes) {
    return JSON.stringify(nodes, (k, v) => {
        if (k === '_branches' && Array.isArray(v) && v.length === 0) return undefined;
        return v;
    });
}

const sample = `whenGreenFlag:
  forever:
    move(10)
    turnRight(15)
    if(touching("mouse-pointer")):
      say("Hello!")

repeat(10):
  changeX(-5)
  ifElse(touching("edge")):
    say("a")
  else:
    say("b")
`;

const n1 = parseTextToNodes(sample);
const text1 = nodesToText(n1);
const n2 = parseTextToNodes(text1);
const text2 = nodesToText(n2);

console.log('parsed nodes count:', n1.length);
console.log('first script:', n1[0].name, 'branches:', n1[0]._branches.length);
console.log('repeat args:', JSON.stringify(n2[1].args));
console.log('repeat body:', JSON.stringify(n2[1]._branches[0], null, 1));
console.log('structural round-trip equal?', norm(n1) === norm(n2));
console.log('text round-trip equal?', text1 === text2);
console.log('==== TEXT1 ====');
console.log(text1);
console.log('==== TEXT2 ====');
console.log(text2);
