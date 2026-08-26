// Resilient development pipeline: QA/reviewer failures must not prevent Builder delivery.
runDevelopment = async function(goal,rules){
  const iterations=Math.min(3,Math.max(1,+$('#rounds').value||2));
  const target=+$('#target').value||9;
  $('#roundLabel').textContent='Definiendo MVP';

  const director=await agent('Director',goal,'',rules,1);
  const architecture=await agent('Arquitecto',goal,director,rules,1);
  const frontend=await agent('Frontend',goal,architecture+'\n\nPRODUCTO:\n'+director,rules,1);
  const backend=await agent('Backend',goal,architecture+'\n\nPRODUCTO:\n'+director,rules,1);

  let plan=`PRODUCTO:\n${director}\n\nARQUITECTURA:\n${architecture}\n\nFRONTEND:\n${frontend}\n\nBACKEND:\n${backend}`;
  let review={score:0,verdict:'ITERAR',reason:'Pendiente de revisión',fixes:[]};
  let approved=false;

  for(let i=1;i<=iterations&&!stopped;i++){
    $('#roundLabel').textContent=`QA ${i} / ${iterations}`;

    let tests='QA automático no disponible en esta iteración. El Builder deberá aplicar el control duro de mocks/TODOs/integraciones.';
    try{
      tests=await agent('Tester',goal,plan,rules,i);
    }catch(e){
      addMsg('Sistema',`Tester no respondió (${e.message}). Continúo con el control de calidad interno.`);
    }

    const extra=review.fixes?.length?`\n\nCORRECCIONES DEL REVIEW ANTERIOR:\n- ${review.fixes.join('\n- ')}`:'';
    try{
      plan=await agent('Integrador',goal,plan+'\n\nPRUEBAS/PROBLEMAS:\n'+tests+extra,rules,i);
    }catch(e){
      addMsg('Sistema',`Integrador no respondió (${e.message}). Conservo el último plan válido y continúo.`);
      plan += `\n\nQA ITERACIÓN ${i}:\n${tests}${extra}`;
    }

    try{
      review=parseJson(await agent('Reviewer',goal,plan,rules,i),{score:0,verdict:'ITERAR',reason:'No se pudo leer el review',fixes:[]});
    }catch(e){
      review={score:7.5,verdict:'ITERAR',reason:'Reviewer temporalmente no disponible; la entrega seguirá al Builder con auditoría estricta.',fixes:['Auditar mocks, TODOs y placeholders','Verificar integraciones y dependencias reales']};
      addMsg('Sistema',`Reviewer no respondió (${e.message}). No cancelo el desarrollo: el Builder continúa y su auditoría final sigue siendo obligatoria.`);
      setAgent('Reviewer','done');
    }

    const score=setScore(review);
    best=plan;
    $('#result').textContent=best;
    if(score>=target||review.verdict==='APROBAR'){
      approved=true;
      addMsg('Director',`Plan técnico aprobado (${score.toFixed(1)}/10). El Builder empieza a programar.`);
      break;
    }
  }

  if(!approved&&!stopped){
    addMsg('Director','QA no alcanzó la nota objetivo, pero existe un plan utilizable. Continúo al Builder; la entrega solo será aceptada si genera archivos reales y pasa el control duro de código incompleto.');
  }

  $('#resultTitle').textContent=approved?'✅ Plan aprobado para construir':'⚙ Plan enviado a Builder con auditoría';
  best=plan;
  $('#result').textContent=best;
  await buildProject(goal,rules,plan);
};
