import {z} from 'zod';

// Vertex uses a limited JSON Schema dialect. The caller still validates every
// response against the original Zod schema, including omitted constraints.
const omitted=new Set(['$schema','minLength','maxLength','pattern','minItems','maxItems',
  'additionalProperties','format','minimum','maximum']);
function simplify(value:unknown):unknown {
  if(Array.isArray(value))return value.map(simplify);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key,entry])=>{
    if(omitted.has(key))return [];
    // Property and definition names belong to the application, not the dialect.
    if(key==='properties'||key==='definitions'||key==='$defs')
      return [[key,Object.fromEntries(Object.entries(entry).map(([name,schema])=>[name,simplify(schema)]))]];
    return [[key==='oneOf'?'anyOf':key,simplify(entry)]];
  }));
}

export function vertexResponseSchema(schema:z.ZodType):unknown {
  return simplify(z.toJSONSchema(schema,{target:'draft-07'}));
}
