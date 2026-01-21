function _1(md){return(
md`# Projeto de Visualização de Dados`
)}

function _uf(FileAttachment){return(
FileAttachment("uf.json").json()
)}

function _municipio(FileAttachment){return(
FileAttachment("municipio.json").json()
)}

function _queimadas_visualization_subset(FileAttachment){return(
FileAttachment("queimadas_visualization_subset.parquet")
)}

function _db(DuckDBClient,FileAttachment){return(
DuckDBClient.of({
  tabela: FileAttachment("queimadas_visualization_subset.parquet")
})
)}

function _data(db){return(
db.query("SELECT * FROM tabela")
)}

async function _dados_geo(require,FileAttachment)
{
  const topojson = await require("topojson-client");
  
  // 1. Carrega os arquivos
  const ufRaw = await FileAttachment("uf.json").json();
  const munRaw = await FileAttachment("municipio.json").json();

  // 2. Descobre chaves dos objetos automaticamente
  const keyUf = Object.keys(ufRaw.objects)[0];
  const keyMun = Object.keys(munRaw.objects)[0];

  // 3. Converte para GeoJSON (Features)
  const estados = topojson.feature(ufRaw, ufRaw.objects[keyUf]);
  const municipios = topojson.feature(munRaw, munRaw.objects[keyMun]);

  return { estados, municipios };
}


function _map_utils(dados_mapa)
{
  const { mapaEstados, mapaMunicipios, getColorEst, getColorMun, normalizar } = dados_mapa;

  return {
    // CAMADA DE ESTADO: Usa getColorEst
    getColorState: (d) => {
      const nome = normalizar(d.properties.name || d.properties.NM_UF || d.properties.nome);
      const valor = mapaEstados.get(nome) || 0;
      return getColorEst(valor); 
    },

    // CAMADA DE MUNICÍPIO: Usa getColorMun
    getColorMuni: (d) => {
      const nome = normalizar(d.properties.name || d.properties.NM_MUN || d.properties.nome);
      const valor = mapaMunicipios.get(nome) || 0;
      return getColorMun(valor);
    },

    getTooltip: (d, tipo) => {
      const nomeOriginal = d.properties.name || d.properties.NM_UF || d.properties.NM_MUN;
      const mapa = tipo === "estado" ? mapaEstados : mapaMunicipios;
      const valor = mapa.get(normalizar(nomeOriginal)) || 0;
      return `${nomeOriginal}: ${valor.toLocaleString()} focos`;
    }
  };
}


function _dados_pontos(dados_mapa,dados_tempo)
{
  const { normalizar } = dados_mapa;
  
  // MUDANÇA AQUI: Usa 'dados_tempo' em vez de 'data'
  // Isso faz o mapa reagir automaticamente ao slider de datas
  return dados_tempo
    .filter(d => d.latitude && d.longitude && !isNaN(d.latitude) && !isNaN(d.longitude))
    .map(d => ({
       lat: +d.latitude,
       lng: +d.longitude,
       estado_norm: normalizar(d.estado),
       municipio: d.municipio,
       bioma: d.bioma, 
       ano: +d.ano,
       mes: +d.mes
    }));
}


function _dados_mapa(d3,data)
{
  const normalizar = (str) => str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : "";

  // 1. Agrupamentos
  const focosPorEstado = d3.rollups(data, v => d3.sum(v, d => d.num_deteccoes_dia), d => normalizar(d.estado));
  const mapaEstados = new Map(focosPorEstado);

  const focosPorMuni = d3.rollups(data, v => d3.sum(v, d => d.num_deteccoes_dia), d => normalizar(d.municipio));
  const mapaMunicipios = new Map(focosPorMuni);

  const totalBrasil = d3.sum(data, d => d.num_deteccoes_dia);
  
  // 2. Máximos para definir os domínios
  const valuesEst = Array.from(mapaEstados.values());
  const maxEstado = d3.max(valuesEst) || 0;
  
  // 3. DEFINIÇÃO DAS ESCALAS CONTÍNUAS (Raiz Quadrada)
  
  // A. Estados (Vermelhos)
  const scaleEst = d3.scaleSequentialSqrt(d3.interpolateYlOrRd).domain([0, maxEstado]);

  // B. Helper para gerar escala municipal dinâmica (Local)
  const gerarEscalaMuni = (maxLocal) => {
      return d3.scaleSequentialSqrt(d3.interpolateYlOrRd).domain([0, maxLocal]);
  };

  // 4. Helper de cor global
  const getColorEst = (valor) => (valor > 0 ? scaleEst(valor) : "#ddd");

  return { 
      mapaEstados, mapaMunicipios, totalBrasil,
      maxEstado, getColorEst, scaleEst,
      gerarEscalaMuni, normalizar 
  };
}


function _callout(){return(
(g, value) => {
  if (!value) return g.style("display", "none");

  g
      .style("display", null)
      .style("pointer-events", "none")
      .style("font", "10px sans-serif");

  const path = g.selectAll("path")
    .data([null])
    .join("path")
      .attr("fill", "white")
      .attr("stroke", "black");

  const text = g.selectAll("text")
    .data([null])
    .join("text")
    .call(text => text
      .selectAll("tspan")
      .data((value + "").split(/\n/))
      .join("tspan")
        .attr("x", 0)
        .attr("y", (d, i) => `${i * 1.1}em`)
        .style("font-weight", (_, i) => i ? null : "bold")
        .text(d => d));

  const {x, y, width: w, height: h} = text.node().getBBox();

  text.attr("transform", `translate(${-w / 2},${15 - y})`);
  path.attr("d", `M${-w / 2 - 10},5H-5l5,-5l5,5H${w / 2 + 10}v${h + 20}h-${w + 20}z`);
}
)}

function _color(d3){return(
d3.scaleOrdinal()
  .domain(["Amazônia", "Caatinga", "Cerrado", "Pantanal", "Mata Atlântica", "Pampa"])
  .range([
    "#228B22", // Amazônia: Verde (ForestGreen)
    "#D32F2F", // Caatinga: Vermelho
    "#FF9800", // Cerrado: Laranja
    "#FFD700", // Pantanal: Amarelo (Gold - para melhor contraste que o yellow puro)
    "#1E90FF", // Mata Atlântica: Azul (DodgerBlue)
    "#800080"  // Pampa: Roxo
  ])
)}

function _filtroCrossfilter(){return(
JSON.parse('{"tipo": "nenhum", "valor": null}')
)}

function _dados_tempo(configSazonalidade,data)
{
  const cfg = configSazonalidade;
  
  // Trava de segurança: Se cfg for undefined, retorna tudo para não dar erro
  if (!cfg || !cfg.inicio || !cfg.fim) return data;

  // Ajuste para incluir o último dia do mês selecionado
  const fimAjustado = new Date(cfg.fim.getFullYear(), cfg.fim.getMonth() + 1, 0);

  return data.filter(d => {
      const dataReg = new Date(d.ano, d.mes - 1, 1);
      return dataReg >= cfg.inicio && dataReg <= fimAjustado;
  });
}


function _configSazonalidade(d3,data,Event)
{
  // 1. Configura limites iniciais baseados nos dados
  const minDate = d3.min(data, d => new Date(d.ano, d.mes - 1, 1));
  const maxDate = d3.max(data, d => new Date(d.ano, d.mes - 1, 1));
  
  // 2. Cria o elemento container (HTML nativo envelopado pelo D3)
  const element = document.createElement("div");
  const container = d3.select(element)
      .style("font-family", "sans-serif").style("font-size", "14px")
      .style("background", "#f0f0f0").style("padding", "15px")
      .style("border-radius", "8px").style("display", "flex")
      .style("gap", "20px").style("align-items", "center")
      .style("flex-wrap", "wrap"); // Garante que não quebre em telas menores

  // --- Grupo de Datas ---
  const dateGroup = container.append("div").style("display", "flex").style("align-items", "center").style("gap", "5px");
  dateGroup.append("div").style("font-weight", "bold").style("margin-right", "5px").text("Período:");
  
  const inputStart = dateGroup.append("input").attr("type", "date").style("padding", "4px").property("value", minDate.toISOString().slice(0, 10));
  dateGroup.append("span").text("até");
  const inputEnd = dateGroup.append("input").attr("type", "date").style("padding", "4px").property("value", maxDate.toISOString().slice(0, 10));

  // --- Botão "Todos" (NOVO) ---
  const btnAll = dateGroup.append("button")
      .text("Todos os dados")
      .attr("title", "Usar todo o período disponível")
      .style("cursor", "pointer")
      .style("margin-left", "8px")
      .style("padding", "4px 10px")
      .style("border", "1px solid #ccc")
      .style("border-radius", "4px")
      .style("background", "white")
      .on("mouseover", function() { d3.select(this).style("background", "#e0e0e0"); })
      .on("mouseout", function() { d3.select(this).style("background", "white"); })
      .on("click", () => {
          inputStart.property("value", minDate.toISOString().slice(0, 10));
          inputEnd.property("value", maxDate.toISOString().slice(0, 10));
          update(); // Força a atualização dos gráficos
      });

  // --- Grupo de Agregação ---
  const aggGroup = container.append("div").style("display", "flex").style("align-items", "center").style("gap", "5px");
  // Separador visual
  aggGroup.append("div").style("width", "1px").style("height", "20px").style("background", "#ccc").style("margin", "0 10px");
  
  aggGroup.append("div").style("font-weight", "bold").text("Visualização:");
  const selectAgg = aggGroup.append("select").style("padding", "4px");
  selectAgg.append("option").attr("value", "anual").text("Por Ano (Somado)");
  selectAgg.append("option").attr("value", "mensal").text("Por Mês (Detalhado)");

  // --- Lógica de Atualização ---
  function update() {
      // Atualiza o valor do elemento HTML para o Observable ler
      element.value = {
          inicio: new Date(inputStart.property("value")),
          fim: new Date(inputEnd.property("value")),
          agregacao: selectAgg.property("value")
      };
      // Dispara o evento para avisar as outras células
      element.dispatchEvent(new Event("input", {bubbles: true}));
  }

  // Ouve os eventos nos inputs
  inputStart.on("input", update);
  inputEnd.on("input", update);
  selectAgg.on("input", update);

  // Inicialização silenciosa (define o valor sem disparar evento inicial)
  element.value = {
      inicio: minDate,
      fim: maxDate,
      agregacao: "anual"
  };
  
  return element;
}


function _mapa(filtroCrossfilter,dados_geo,dados_mapa,dados_pontos,d3)
{
  const width = 900;
  const height = 800;
  
  // Dependências
  const filtro = filtroCrossfilter;
  const geoEstados = dados_geo.estados;
  const geoMunicipios = dados_geo.municipios;
  
  const { 
      normalizar, totalBrasil, 
      mapaEstados, mapaMunicipios, 
      scaleEst, maxEstado, getColorEst, 
      gerarEscalaMuni 
  } = dados_mapa;

  // Lógica de Filtragem: Cria "localMapaEstados" baseado no filtro
  let pontosFiltrados = dados_pontos;
  let modoBioma = false;
  let valorBioma = null;
  
  if (filtro) {
      // 1. Filtro Simples de Bioma
      if (filtro.tipo === "bioma") {
          modoBioma = true;
          valorBioma = filtro.valor;
          const b = normalizar(filtro.valor);
          pontosFiltrados = dados_pontos.filter(d => normalizar(d.bioma) === b);
      }
      // 2. Filtro de Ano (vindo do Sunburst)
      else if (filtro.tipo === "ano") {
          // Primeiro, filtra pelo Ano selecionado
          pontosFiltrados = dados_pontos.filter(d => d.ano === +filtro.valor);

          // Depois, aplica o CONTEXTO (Estado ou Bioma)
          if (filtro.contexto) {
              if (filtro.contexto.tipo === "bioma") {
                  modoBioma = true;
                  valorBioma = filtro.contexto.valor;
                  const b = normalizar(filtro.contexto.valor);
                  pontosFiltrados = pontosFiltrados.filter(d => normalizar(d.bioma) === b);
              } 
              else if (filtro.contexto.tipo === "estado") {
                  const e = normalizar(filtro.contexto.valor);
                  pontosFiltrados = pontosFiltrados.filter(d => normalizar(d.estado_norm || d.estado) === e);
              }
          }
      }
  }
  
  // Recalcula contagem por estado (Dinâmico)
  const localMapaEstados = d3.rollup(pontosFiltrados, v => v.length, d => normalizar(d.estado_norm || d.estado));
  const maxLocalEstado = d3.max(Array.from(localMapaEstados.values())) || 100;
  const localColorScale = d3.scaleSequentialSqrt(d3.interpolateYlOrRd)
      .domain([0, maxLocalEstado]);
  // Recalcula contagem por município (Dinâmico)
  const localMapaMunicipios = d3.rollup(pontosFiltrados, v => v.length, d => normalizar(d.municipio || ""));
  const localTotal = pontosFiltrados.length;
  
  // Guarda a escala atual dos municípios (para legenda e pintura)
  let currentMuniScale = null;

  // Infobox
  const mainContainer = d3.create("div")
      .style("position", "relative")
      .style("width", "100%")
      .style("font-family", "'Segoe UI', Roboto, Helvetica, Arial, sans-serif")
      .style("background", "#eef");

  const header = mainContainer.append("div")
      .style("width", "100%").style("text-align", "center")
      .style("padding-top", "15px").style("padding-bottom", "5px");

  const titleElement = header.append("h3")
      .style("margin", "0").style("color", "#000").style("font-size", "20px")
      .text("Focos de Incêndio por Estado");
  if (modoBioma) {
      let texto = `Focos no Bioma ${valorBioma}`;
      if (filtro.tipo === "ano") texto += ` em ${filtro.valor}`;
      titleElement.text(texto);
  } else if (filtro && filtro.tipo === "ano" && filtro.contexto?.tipo === "estado") {
      titleElement.text(`Focos em ${filtro.contexto.valor} (${filtro.valor})`);
  } else {
      titleElement.text("Focos de Incêndio por Estado");
  }

  const topRightContainer = mainContainer.append("div")
      .style("position", "absolute").style("top", "10px").style("right", "10px")
      .style("display", "flex").style("gap", "10px").style("align-items", "flex-start")
      .style("z-index", "100");

  const legendSvg = topRightContainer.append("svg")
      .attr("width", 320).attr("height", 60)
      .style("background", "rgba(255, 255, 255, 0.9)")
      .style("border-radius", "4px").style("box-shadow", "0 1px 3px rgba(0,0,0,0.1)");
  
  const gLegend = legendSvg.append("g").attr("transform", "translate(15, 20)");

  const infoPanel = topRightContainer.append("div")
      .style("background", "rgba(255, 255, 255, 0.95)").style("padding", "15px")
      .style("border", "1px solid #ccc").style("border-radius", "4px")
      .style("box-shadow", "0 2px 5px rgba(0,0,0,0.1)").style("pointer-events", "none")
      .style("min-width", "200px")
      .html(templateInfoBox("Brasil", totalBrasil));

  // Mapa
  const svg = mainContainer.append("svg")
      .attr("viewBox", [0, 0, width, height])
      .style("display", "block").style("margin-top", "-40px");

  const projection = d3.geoMercator()
      .scale(850).center([-54, -15]).translate([width / 2, height / 2]);
  const path = d3.geoPath().projection(projection);

  const g = svg.append("g");
  const gEstados = g.append("g");
  const gMunicipios = g.append("g");
  
  let activeState = d3.select(null);
  let activeMuni = d3.select(null);

  //Desenho estados
  gEstados.selectAll("path")
    .data(geoEstados.features)
    .join("path")
      .attr("d", path).attr("stroke", "white").style("cursor", "pointer")
      .attr("fill", d => {
          const val = localMapaEstados.get(normalizar(d.properties.name || d.properties.NM_UF)) || 0;
          return val > 0 ? localColorScale(val) : "#eee"; 
      })
      .on("click", clickedState)
      .on("mouseover", d => updateInfoBox(d, "estado")) 
      .on("mouseout", () => {
          if (activeMuni.node()) updateInfoBox(activeMuni.datum(), "municipio", true);
          else if (activeState.node()) updateInfoBox(activeState.datum(), "estado", true);
          else resetInfoBox();
      }); 

  // Legenda Inicial Contínua (Estado)
  drawContinuousLegend(localColorScale, "Focos (Visualização Atual)", d3.interpolateYlOrRd);

  // Interação
  // 1. Lógica para estado
  if (filtro && filtro.tipo === "estado") {
      const estadoAlvo = geoEstados.features.find(d => 
          normalizar(d.properties.name || d.properties.NM_UF) === normalizar(filtro.valor)
      );
      
      if (estadoAlvo) {
          setTimeout(() => {
             const nodes = gEstados.selectAll("path").nodes();
             const index = geoEstados.features.indexOf(estadoAlvo);
             if (nodes[index]) clickedState.call(nodes[index], null, estadoAlvo);
          }, 50);
      }
  }

  // 2. Lógica para bioma
  if (filtro && filtro.tipo === "bioma") {
      setTimeout(() => {
          const nomesEstados = new Set(pontosFiltrados.map(d => normalizar(d.estado_norm || d.estado)));          
          const featuresEstados = geoEstados.features.filter(d => 
              nomesEstados.has(normalizar(d.properties.name || d.properties.NM_UF))
          );

          const codigosUF = new Set(featuresEstados.map(d => String(d.properties.codigo || d.id).slice(0, 2)));
          
          const featuresMunis = geoMunicipios.features.filter(m => {
              const codigoMuni = String(m.id || m.properties.codigo);
              return codigosUF.has(codigoMuni.slice(0, 2));
          });

          if (featuresEstados.length > 0) {
             const collection = { type: "FeatureCollection", features: featuresEstados };
             const [[x0, y0], [x1, y1]] = path.bounds(collection);
             const padding = 0.9;
             const scale = Math.max(1, Math.min(6, padding / Math.max((x1 - x0) / width, (y1 - y0) / height)));
             const translate = [width / 2 - scale * ((x0 + x1) / 2), height / 2 - scale * ((y0 + y1) / 2)];
             
             const valoresVisiveis = featuresMunis.map(m => localMapaMunicipios.get(normalizar(m.properties.name || m.properties.NM_MUN)) || 0);
             const maxLocalMuni = d3.max(valoresVisiveis) || 100;
             currentMuniScale = gerarEscalaMuni(maxLocalMuni);
             
             drawContinuousLegend(currentMuniScale, `Focos (Municípios - ${filtro.valor})`, d3.interpolateYlOrRd);

             gMunicipios.selectAll("path").remove();
             gMunicipios.selectAll("path")
                .data(featuresMunis)
                .join("path")
                .attr("d", path)
                .attr("stroke", "#999")
                .attr("stroke-width", 0.3 / scale) 
                .style("cursor", "crosshair")
                .attr("fill", d => {
                    const val = localMapaMunicipios.get(normalizar(d.properties.name || d.properties.NM_MUN)) || 0;
                    return val > 0 ? currentMuniScale(val) : "white";
                })
                .style("opacity", 0) 
                .on("mouseover", d => updateInfoBox(d, "municipio"))
                .on("mouseout", () => {
                     const label = `BIOMA ${filtro.valor.toUpperCase()}`;
                     infoPanel.html(templateInfoBox(label, localTotal));
                })
                .transition().duration(750)
                .style("opacity", 1); 

             gEstados.selectAll("path").transition().duration(750)
                 .style("opacity", 0.05) 
                 .attr("stroke-width", 2 / scale);

             g.transition().duration(750)
              .attr("transform", `translate(${translate})scale(${scale})`);
             
             activeState = d3.select(null);
             activeMuni = d3.select(null);
          }
      }, 50);
  }
  
  function clickedState(event, d) {
    if (activeState.node() === this) return reset();

    activeState.classed("active", false);
    activeState = d3.select(this).classed("active", true);
    activeMuni.classed("active", false);
    activeMuni = d3.select(null);

    zoomToBoundingBox(d, 0.9, 20);

    const ufCodigo = String(d.properties.codigo || d.id).slice(0, 2);
    const munisDesteEstado = geoMunicipios.features.filter(m => String(m.id || m.properties.codigo).startsWith(ufCodigo));
    const valoresLocais = munisDesteEstado.map(m => localMapaMunicipios.get(normalizar(m.properties.name || m.properties.NM_MUN)) || 0);
    const maxLocal = d3.max(valoresLocais) || 100; // fallback

    currentMuniScale = gerarEscalaMuni(maxLocal);

    drawMunicipios(d, munisDesteEstado);
    drawContinuousLegend(currentMuniScale, "Focos (Município)", d3.interpolateYlOrRd);
    
    gEstados.selectAll("path").transition()
        .style("opacity", 0.1)
        .attr("fill", d => getColorEst(localMapaEstados.get(normalizar(d.properties.name || d.properties.NM_UF)) || 0));

    d3.select(this).transition()
        .style("opacity", 1)
        .attr("fill", "#fff");
    
    titleElement.text(d.properties.NM_UF || d.properties.name);
    updateInfoBox(d, "estado", true);
  }

  function clickedMuni(event, d) {
    event.stopPropagation();
    if (activeMuni.node() === this) {
        gMunicipios.selectAll("path").transition().duration(500)
           .style("opacity", 1) 
           .attr("stroke", "#555").attr("stroke-width", null);
        
        const estadoAtual = activeState.datum();
        titleElement.text(estadoAtual.properties.NM_UF || estadoAtual.properties.name);
        activeMuni.classed("active", false);
        activeMuni = d3.select(null);
        zoomToBoundingBox(estadoAtual, 0.9, 20);
        updateInfoBox(estadoAtual, "estado", true);
        return;
    }

    activeMuni.classed("active", false);
    activeMuni = d3.select(this).classed("active", true);

    const paddingFactor = 0.85; 
    const maxZoom = 40;
    const [[x0, y0], [x1, y1]] = path.bounds(d);
    const scale = Math.max(1, Math.min(maxZoom, paddingFactor / Math.max((x1 - x0) / width, (y1 - y0) / height)));
    zoomToBoundingBox(d, paddingFactor, maxZoom);

    gMunicipios.selectAll("path").transition().duration(500)
        .style("opacity", 0.2) 
        .attr("stroke", "#ccc").attr("stroke-width", 0.1 / scale);

    d3.select(this).raise().transition().duration(500)
        .style("opacity", 1) 
        .attr("stroke", "#555").attr("stroke-width", 1.5 / scale);

    titleElement.text(d.properties.name || d.properties.NM_MUN);
    updateInfoBox(d, "municipio", true);
  }

  function drawContinuousLegend(scale, titulo, interpolator) {
      gLegend.selectAll("*").remove();

      legendSvg.selectAll("defs").remove();
    
      const defs = legendSvg.append("defs");
      const linearGradient = defs.append("linearGradient").attr("id", "legend-gradient");

      linearGradient.selectAll("stop")
          .data(d3.range(0, 1.1, 0.1)).enter().append("stop")
          .attr("offset", d => `${d * 100}%`)
          .attr("stop-color", d => interpolator(d)); 

      gLegend.append("text").attr("x", 0).attr("y", -8)
          .style("font-weight", "bold").style("font-size", "11px").style("fill", "#000").text(titulo);

      const barWidth = 280;
      const barHeight = 10;

      gLegend.append("rect")
          .attr("width", barWidth).attr("height", barHeight)
          .style("fill", "url(#legend-gradient)");

      const domain = scale.domain(); 
      const maxVal = domain[1];
      
      const xScale = d3.scaleLinear().domain([0, maxVal]).range([0, barWidth]);
      const ticks = xScale.ticks(5);

      ticks.forEach(tickVal => {
          const xPos = xScale(tickVal);
          gLegend.append("text")
              .attr("x", xPos).attr("y", barHeight + 12)
              .attr("text-anchor", "middle").style("font-size", "9px").style("fill", "#000")
              .text(Math.round(tickVal).toLocaleString("pt-BR"));

          gLegend.append("line")
              .attr("x1", xPos).attr("x2", xPos)
              .attr("y1", barHeight).attr("y2", barHeight + 3).attr("stroke", "#000");
      });
  }

  // Helpers
  function templateInfoBox(nome, valor, estNome, estValor) {
      const L = "color: #000; font-size: 10px; text-transform: uppercase; margin-bottom: 2px; font-weight: bold;";
      const N = "color: #000; font-size: 14px; margin-bottom: 2px;";
      const V = "color: #000; font-weight: bold; font-size: 16px;";
      const S = "font-weight: normal; font-size: 11px; color: #000;";
      const H = "border-top: 1px solid #ccc; margin: 8px 0;";

      const labelTopo = (filtro && filtro.tipo === "bioma") ? `BIOMA ${filtro.valor.toUpperCase()}` : "BRASIL";

      let h = `<div style="${L}">${labelTopo}</div><div style="${V}">${localTotal.toLocaleString()} <small style="${S}">focos</small></div>`;
      if (estNome) h += `<div style="${H}"></div><div style="${L}">ESTADO</div><div style="${N}">${estNome}</div><div style="${V}">${estValor.toLocaleString()} <small style="${S}">focos</small></div>`;
      if (nome !== "Brasil" && nome !== estNome && nome !== filtro?.valor) h += `<div style="${H}"></div><div style="${L}">MUNICÍPIO</div><div style="${N}"><b>${nome}</b></div><div style="${V}">${valor.toLocaleString()} <small style="${S}">focos</small></div>`;
      return h;
  }

  function updateInfoBox(d, tipo, fixo) {
      if (!fixo && activeMuni.node()) return;
      const nome = d.properties.name || d.properties.NM_UF || d.properties.NM_MUN;
      const nomeNorm = normalizar(nome);
      let estNome, estValor, valor = 0;

      if (tipo === "estado") {
          estNome = nome;
          estValor = localMapaEstados.get(nomeNorm) || 0;
          valor = estValor;
      } else {
          if (activeState.node()) {
             const dt = activeState.datum();
             estNome = dt.properties.name || dt.properties.NM_UF;
             estValor = localMapaEstados.get(normalizar(estNome)) || 0;
          }
          valor = localMapaMunicipios.get(nomeNorm) || 0;
          if (valor === 0) valor = localMapaMunicipios.get(String(d.id || d.properties.codigo)) || 0;
      }
      infoPanel.html(templateInfoBox(nome, valor, estNome, estValor));
  }
  
  function resetInfoBox() { 
      const label = filtro && filtro.tipo === "bioma" ? filtro.valor : "Brasil";
      infoPanel.html(templateInfoBox(label, localTotal)); 
  }

  function zoomToBoundingBox(d, paddingFactor = 0.9, maxZoom = 20) {
    const [[x0, y0], [x1, y1]] = path.bounds(d);
    const scale = Math.max(1, Math.min(maxZoom, paddingFactor / Math.max(((x1 - x0) / width), ((y1 - y0) / height))));
    const translate = [width / 2 - scale * ((x0 + x1) / 2), height / 2 - scale * ((y0 + y1) / 2)];
    g.transition().duration(750).attr("transform", `translate(${translate})scale(${scale})`)
      .on("start", () => {
          gEstados.attr("stroke-width", 1 / scale);
          gMunicipios.attr("stroke-width", 0.5 / scale);
      });
  }

  function drawMunicipios(estadoFeature, featuresFiltradas) {
    gMunicipios.selectAll("path").remove();
    gMunicipios.selectAll("path").data(featuresFiltradas).join("path")
        .attr("d", path).attr("stroke", "#555").attr("stroke-width", 0.1).style("cursor", "zoom-in")
        .attr("fill", d => {
            const val = localMapaMunicipios.get(normalizar(d.properties.name || d.properties.NM_MUN)) || 0;
            return val > 0 ? currentMuniScale(val) : "white";
        })
        .style("opacity", 1) 
        .on("click", clickedMuni)
        .on("mouseover", d => updateInfoBox(d, "municipio"))
        .on("mouseout", () => {
            if (activeMuni.node()) updateInfoBox(activeMuni.datum(), "municipio", true);
            else updateInfoBox(estadoFeature, "estado", true);
        });
  }

  function reset() {
    activeState = d3.select(null);
    activeMuni = d3.select(null);
    currentMuniScale = null;
    g.transition().duration(750).attr("transform", "").on("end", () => { gEstados.attr("stroke-width", 1); });
    gEstados.selectAll("path").transition().style("opacity", 1).attr("fill", d => getColorEst(localMapaEstados.get(normalizar(d.properties.name || d.properties.NM_UF)) || 0));
    gMunicipios.selectAll("path").remove();
    
    if (filtro && filtro.tipo === "bioma") titleElement.text(`Focos no Bioma ${filtro.valor}`);
    else titleElement.text("Focos de Incêndio por Estado");
    
    drawContinuousLegend(scaleEst, "Focos (Estado)", d3.interpolateYlOrRd);
    resetInfoBox();
  }
  
  svg.on("click", (e) => { if(e.target.tagName === "svg") reset(); });
  return mainContainer.node();
}


function _barras(filtroCrossfilter,data,d3,Plot)
{
  const f = filtroCrossfilter; // Captura o filtro para reatividade
  const periodosOrdemBase = ["Madrugada", "Manhã", "Tarde", "Noite"];

  // Filtragem local
  let dadosLocais = data; 

  if (f && f.tipo !== "nenhum") {
    if (f.tipo === "estado") {
      dadosLocais = data.filter(d => d.estado === f.valor);
    } else if (f.tipo === "bioma") {
      dadosLocais = data.filter(d => d.bioma === f.valor);
    } else if (f.tipo === "ano") {
      dadosLocais = data.filter(d => +d.ano === +f.valor);
      if (f.contexto?.tipo === "bioma") {
        dadosLocais = dadosLocais.filter(d => d.bioma === f.contexto.valor);
      } else if (f.contexto?.tipo === "estado") {
        dadosLocais = dadosLocais.filter(d => d.estado === f.contexto.valor);
      }
    }
  }

  // Funções auxiliares
  const getPeriodo = (d) => {
    let h = 14;
    if (d.hora !== undefined) h = +d.hora;
    else if (d.datahora) h = d.datahora instanceof Date ? d.datahora.getHours() : new Date(d.datahora).getHours();
    if (h >= 0 && h < 6) return "Madrugada";
    if (h >= 6 && h < 12) return "Manhã";
    if (h >= 12 && h < 18) return "Tarde";
    return "Noite";
  };

  let rotulo = "Brasil";
  if (f && f.tipo !== "nenhum") {
    rotulo = f.tipo === "ano" 
      ? (f.contexto ? `${f.contexto.valor} (${f.valor})` : `Brasil (${f.valor})`)
      : f.valor;
  }

  // Agregação e ordenação
  const totaisMap = d3.rollup(dadosLocais, v => d3.sum(v, d => d.num_deteccoes_dia || 1), getPeriodo);
  
  const dadosBrutos = periodosOrdemBase.map(p => ({
    local: rotulo,
    periodo: p,
    focos: totaisMap.get(p) || 0
  }));

  const dadosOrdenados = dadosBrutos.sort((a, b) => a.focos - b.focos);
  const totalSoma = d3.sum(dadosOrdenados, d => d.focos);
  const valorMinimoVisual = totalSoma > 0 ? totalSoma * 0.05 : 10;

  const dadosFinais = dadosOrdenados.map(d => ({
    ...d,
    focosVisual: d.focos === 0 ? valorMinimoVisual : d.focos
  }));

  // Renderização
  return Plot.plot({
    title: `Distribuição de Focos por Horário: ${rotulo}`,
    marginLeft: 150,
    y: { label: null },
    x: { grid: true, label: "Total de focos" },
    color: { 
      domain: periodosOrdemBase, 
      legend: true,
      label: "Período"
    },
    marks: [
      Plot.barX(dadosFinais, {
        y: "local",
        x: "focosVisual",
        fill: "periodo",
        tip: true
      }),
      Plot.text(dadosFinais, Plot.stackX({
        y: "local",
        x: "focosVisual",
        text: d => d.focos.toLocaleString("pt-BR"),
        fill: "white",
        fontSize: 14,
        fontWeight: "bold",
        stroke: "black",
        strokeWidth: 0.5
      }))
    ]
  });
}


function _sunburst_sazonal(dados_tempo,configSazonalidade,d3,$0,color)
{
  // Configurações
  const data = dados_tempo;
  const config = configSazonalidade;
  const width = 900;
  const height = width;
  const radius = width / 6; 
  const transitionDuration = 750;
  const THRESHOLD_ESTADO = 0.04; 

  // Histórico para navegação
  let history = { 
      activeBioma: null, 
      viewType: "geo",   
      lastView: null,    
      estado: null       
  };

  const mapMesesSigla = {
    1: "JAN", 2: "FEV", 3: "MAR", 4: "ABR", 5: "MAI", 6: "JUN",
    7: "JUL", 8: "AGO", 9: "SET", 10: "OUT", 11: "NOV", 12: "DEZ"
  };
  const mapMesesExtenso = {
    1: "JANEIRO", 2: "FEVEREIRO", 3: "MARÇO", 4: "ABRIL", 5: "MAIO", 6: "JUNHO",
    7: "JULHO", 8: "AGOSTO", 9: "SETEMBRO", 10: "OUTUBRO", 11: "NOVEMBRO", 12: "DEZEMBRO"
  };

  // Preparação dos dados
  const getGeoHierarchy = () => {
    const children = d3.groups(data, d => d.bioma).map(([bioma, registros]) => {
      const total = d3.sum(registros, d => d.num_deteccoes_dia);
      let estados = d3.rollups(registros, v => d3.sum(v, d => d.num_deteccoes_dia), d => d.estado)
        .sort((a, b) => b[1] - a[1]);
        
      const principais = [];
      let outros = 0;
      estados.forEach(([nome, valor]) => {
        if (valor / total >= THRESHOLD_ESTADO) principais.push({name: nome, value: valor});
        else outros += valor;
      });
      if (outros > 0) principais.push({name: "Outros", value: outros});
      return { name: bioma, children: principais, type: "bioma" };
    });
    return { name: "Brasil", children, type: "root" };
  };

  const getBiomaSazonalHierarchy = (biomaNome) => {
    const dadosBioma = data.filter(d => d.bioma === biomaNome);
    
    // Verifica se a configuração é Anual
    const isAnual = config.agregacao === "anual";
    const keyFn = isAnual ? d => +d.ano : d => +d.mes;

    const grupos = d3.rollups(dadosBioma, v => d3.sum(v, d => d.num_deteccoes_dia), keyFn)
      .sort((a, b) => a[0] - b[0]);
      
    const children = grupos.map(([chave, valor]) => ({
      name: isAnual ? String(chave) : mapMesesSigla[chave], 
      full_name: isAnual ? `${chave}` : mapMesesExtenso[chave],
      mesNumber: chave,
      value: valor, 
      type: isAnual ? "ano" : "mes"
    }));
    
    return { name: biomaNome, children, type: "bioma-root" };
  };

  const getStateSazonalHierarchy = (biomaNome, estadoNome) => {
    const dadosFiltrados = data.filter(d => d.bioma === biomaNome && d.estado === estadoNome);
    
    const isAnual = config.agregacao === "anual";
    const keyFn = isAnual ? d => +d.ano : d => +d.mes;

    const grupos = d3.rollups(dadosFiltrados, v => d3.sum(v, d => d.num_deteccoes_dia), keyFn)
      .sort((a, b) => a[0] - b[0]);
      
    const children = grupos.map(([chave, valor]) => ({
      name: isAnual ? String(chave) : mapMesesSigla[chave],
      full_name: isAnual ? `${chave}` : mapMesesExtenso[chave],
      mesNumber: chave,
      value: valor, 
      type: isAnual ? "ano" : "mes"
    }));

    return { name: estadoNome, children, type: "state-root" };
  };

  const getMonthHierarchy = (mesNome, mesFullName, valor, mesNumber) => {
      return { 
          name: mesNome, 
          full_name: mesFullName,
          mesNumber: mesNumber, 
          children: [{ name: "", value: valor }], 
          type: "month-root" 
      };
  };

  // Setup SVG
  const svg = d3.create("svg")
      .attr("viewBox", [-width / 2, -height / 2, width, height])
      .style("font", "10px sans-serif");

  const g = svg.append("g");
  
  svg.append("text")
     .attr("x", 0).attr("y", -height / 2 + 30).attr("text-anchor", "middle")
     .style("font-size", "22px").style("font-weight", "bold").style("fill", "#333")
     .text("Distribuição de Focos: Biomas e Sazonalidade");

  const centerCircle = g.append("circle")
      .attr("r", radius).attr("fill", "white")
      .style("filter", "drop-shadow(0px 3px 3px rgba(0,0,0,0.1))").style("cursor", "pointer");

  const infoLabel = g.append("text").attr("dy", "-3.5em").attr("text-anchor", "middle").style("font-size", "10px").style("fill", "#888").style("font-weight", "bold").style("pointer-events", "none");
  const infoName = g.append("text").attr("dy", "-0.5em").attr("text-anchor", "middle").style("font-weight", "bold").style("font-size", "14px").style("fill", "#222").style("pointer-events", "none");
  const infoValue = g.append("text").attr("dy", "1.0em").attr("text-anchor", "middle").style("font-size", "22px").style("font-weight", "300").style("fill", "#d32f2f").style("pointer-events", "none");
  const infoUnit = g.append("text").attr("dy", "3.2em").attr("text-anchor", "middle").style("font-size", "10px").style("fill", "#d32f2f").text("focos detectados").style("pointer-events", "none");
  const infoHint = g.append("text").attr("dy", "5.5em").attr("text-anchor", "middle").style("font-size", "9px").style("fill", "#999").style("font-style", "italic").style("pointer-events", "none");

  const updateCenterInfo = (label, name, value, hint, fontSize) => {
      infoLabel.text(label);
      infoName.text(name).style("font-size", fontSize + "px"); 
      infoValue.text(value.toLocaleString("pt-BR"));
      if (hint !== undefined) infoHint.text(hint);
  };

  const arc = d3.arc().startAngle(d => d.x0).endAngle(d => d.x1).padAngle(0.005).padRadius(radius * 1.5).innerRadius(d => d.y0 * radius).outerRadius(d => Math.max(d.y0 * radius, d.y1 * radius - 1));

  const draw = (hierarchyData, viewType) => {
    
    const filterState = {
        bioma: (viewType === "geo") ? null : history.activeBioma,
        estado: (viewType === "state-sazonal" || (viewType === "month" && history.estado)) ? history.estado : null,
        mes: (viewType === "month") ? hierarchyData.mesNumber : null
    };

    svg.node().value = filterState;
    svg.dispatch("input"); 

    history.viewType = viewType;
    const currentFontSize = (viewType === "geo") ? 15 : 22;

    const root = d3.hierarchy(hierarchyData)
        .sum(d => d.value)
        .sort((a, b) => (viewType === "geo") ? b.value - a.value : null);

    d3.partition().size([2 * Math.PI, 2])(root);

    let labelText = "VISÃO GERAL";
    let hintText = "Clique em um anel externo";
    
    if (viewType === "bioma-sazonal") {
        labelText = "BIOMA SELECIONADO";
        hintText = "Clique no centro para voltar";
    } else if (viewType === "state-sazonal") {
        labelText = "ESTADO SELECIONADO";
        hintText = "Clique no centro para voltar";
    } else if (viewType === "month") {
        labelText = "MÊS SELECIONADO";
        hintText = "Clique no centro para voltar";
    }

    const centerName = root.data.full_name ? root.data.full_name : root.data.name.toUpperCase();
    updateCenterInfo(labelText, centerName, root.value, hintText, currentFontSize);
    
    g.selectAll("text:not(:first-child)").attr("opacity", 0).transition().duration(500).attr("opacity", 1);

    centerCircle.on("click", () => {
        if (viewType === "month") {
            if (history.lastView === "bioma-sazonal") {
                 draw(getBiomaSazonalHierarchy(history.activeBioma), "bioma-sazonal");
                 // Volta o filtro para Bioma
                 $0.value = { tipo: "bioma", valor: history.activeBioma };
            } else {
                 draw(getStateSazonalHierarchy(history.activeBioma, history.estado), "state-sazonal");
                 // Volta o filtro para Estado
                 $0.value = { tipo: "estado", valor: history.estado };
            }
        } else {
            history.activeBioma = null;
            history.estado = null;
            
            // RESET TOTAL (Cria um novo objeto limpo)
            $0.value = { tipo: "nenhum", valor: null };
            
            draw(getGeoHierarchy(), "geo");
        }
    });

    const paths = g.selectAll("path").data(root.descendants().filter(d => d.depth), d => d.data.name);
    paths.exit().transition().duration(transitionDuration).attr("opacity", 0).remove();

    const pathsEnter = paths.enter().append("path")
      .attr("fill", d => {
        if (viewType === "geo") {
            const key = d.depth === 1 ? d.data.name : d.parent.data.name;
            return color(key);
        } else {
            return color(history.activeBioma || "Outros");
        }
      })
      .attr("d", arc)
      .attr("opacity", 0)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
         if (viewType === "geo" && d.depth === 1) {
             $0.value = { tipo: "bioma", valor: d.data.name };

             history.activeBioma = d.data.name;
             history.lastView = "geo";
             draw(getBiomaSazonalHierarchy(d.data.name), "bioma-sazonal");
         }
         else if (viewType === "geo" && d.depth === 2 && d.data.name !== "Outros") {
             $0.value = { tipo: "estado", valor: d.data.name };

             history.activeBioma = d.parent.data.name;
             history.estado = d.data.name;
             history.lastView = "geo";
             draw(getStateSazonalHierarchy(history.activeBioma, history.estado), "state-sazonal");
         }
         else if ((viewType === "bioma-sazonal" || viewType === "state-sazonal") && d.depth === 1) {
             if (config.agregacao === "anual") {
                 let contextoAtual = null;
                 if (history.estado) {
                     contextoAtual = { tipo: "estado", valor: history.estado };
                 } else if (history.activeBioma) {
                     contextoAtual = { tipo: "bioma", valor: history.activeBioma };
                 }

                 $0.value = { 
                     tipo: "ano", 
                     valor: d.data.mesNumber, 
                     contexto: contextoAtual
                 };
             }
           
             history.lastView = viewType;
             draw(getMonthHierarchy(d.data.name, d.data.full_name, d.value, d.data.mesNumber), "month");
         }
      })
      .on("mouseover", function(event, d) {
          d3.select(this).style("opacity", 1);
          if (viewType === "month") return;
          let label = "DETALHE";
          if (viewType === "geo") label = d.depth === 1 ? "BIOMA" : "ESTADO";
          if (viewType === "bioma-sazonal" || viewType === "state-sazonal") {
               label = (config.agregacao === "anual") ? "ANO" : "MÊS";
          }
          const name = d.data.full_name ? d.data.full_name : d.data.name.toUpperCase();
          updateCenterInfo(label, name, d.value, undefined, currentFontSize); 
          infoHint.text("");
      })
      .on("mouseout", function(event, d) {
         const defaultOpacity = (viewType === "geo" && d.depth === 2) ? 0.6 : 0.8;
         d3.select(this).style("opacity", defaultOpacity);
         updateCenterInfo(labelText, centerName, root.value, hintText, currentFontSize);
      });

    pathsEnter.append("title");

    paths.merge(pathsEnter)
      .transition().duration(transitionDuration)
      .attr("opacity", d => (viewType === "geo" && d.depth === 1) ? 0.9 : (viewType === "geo" ? 0.6 : 0.8))
      .attr("d", arc)
      .attr("fill", d => {
         if (viewType === "geo") {
            const key = d.depth === 1 ? d.data.name : d.parent.data.name;
            return color(key);
        } else {
            return color(history.activeBioma || "Outros");
        } 
      });

    g.selectAll("path").select("title").text(d => `${d.data.full_name || d.data.name}\n${d.value.toLocaleString("pt-BR")} focos`);

    const labels = g.selectAll("text.label").data(root.descendants().filter(d => d.depth && (d.y0 + d.y1)/2 * (d.x1 - d.x0) > 0.05), d => d.data.name);
    labels.exit().remove();
    const labelsEnter = labels.enter().append("text").attr("class", "label").attr("pointer-events", "none").attr("text-anchor", "middle").attr("opacity", 0);

    labels.merge(labelsEnter)
      .transition().duration(transitionDuration)
      .attr("opacity", 1)
      .attr("transform", d => {
        const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
        const y = (d.y0 + d.y1) / 2 * radius;
        return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
      })
      .style("font-size", "9px")
      .style("font-weight", d => d.depth === 1 ? "bold" : "normal")
      .each(function(d) {
          const el = d3.select(this);
          const nameUpper = d.data.name.toUpperCase();
          if (nameUpper === "RIO GRANDE DO SUL") { el.text(""); }
          else if (nameUpper === "MATO GROSSO DO SUL") {
              el.text(""); el.append("tspan").attr("x", 0).attr("dy", "-0.2em").text("MATO GROSSO");
              el.append("tspan").attr("x", 0).attr("dy", "1.1em").text("DO SUL");
          }
          else { el.text(d.data.name); el.attr("dy", "0.35em"); }
      });
  };

  draw(getGeoHierarchy(), "geo");
  
  return svg.node();
}


function _parallel_coordinates(dados_tempo,sunburst_sazonal,d3,DOM,color)
{
  const data = dados_tempo;
  // 1. Configuração dos limites
  const limites = {
    latitude: { min: -35, max: 6 },            
    mes: { min: 1, max: 12 },                  
    precipitacao_max: { min: 0, max: 60 },    
    num_dias_sem_chuva_max: { min: 0, max: 120 }, 
    risco_fogo_max: { min: 0, max: 1 }          
  };

  // 2. Filtragem
  const dataLimpa = data.filter(d => {
    return (
      (+d.latitude >= limites.latitude.min && +d.latitude <= limites.latitude.max) &&
      (+d.mes >= limites.mes.min && +d.mes <= limites.mes.max) &&
      (+d.precipitacao_max >= limites.precipitacao_max.min && +d.precipitacao_max <= limites.precipitacao_max.max) &&
      (+d.num_dias_sem_chuva_max >= limites.num_dias_sem_chuva_max.min && +d.num_dias_sem_chuva_max <= limites.num_dias_sem_chuva_max.max) &&
      (+d.risco_fogo_max >= limites.risco_fogo_max.min && +d.risco_fogo_max <= limites.risco_fogo_max.max)
    );
  });

  // 3. Amostragem com filtro
  const masterSample = dataLimpa.slice(0, 600); 
  
  const filtroAtivo = sunburst_sazonal; 
  
  const sample_data = masterSample.filter(d => {
      if (!filtroAtivo) return true;

      if (filtroAtivo.bioma && d.bioma !== filtroAtivo.bioma) return false;

      if (filtroAtivo.estado && d.estado !== filtroAtivo.estado) return false;

      if (filtroAtivo.mes && +d.mes !== +filtroAtivo.mes) return false;

      return true;
  });

  // 4. Configuração visual
  var margin = {top: 150, right: 50, bottom: 30, left: 40};
  
  var w = 900 - margin.left - margin.right;
  var height = 450 - margin.top - margin.bottom;

  var x = d3.scalePoint().range([0, w]).padding(1),
      y = {};

  var line = d3.line(),
      background,
      foreground;
  
  const svg = d3.select(DOM.svg(w + margin.left + margin.right, height + margin.top + margin.bottom));
  
  const svg_adjusted = svg.append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");   
  
  // 5. Cabeçalho
  const headerGroup = svg.append("g").attr("transform", `translate(${margin.left + w/2}, ${margin.top/2})`);

  headerGroup.append("text")
      .attr("y", -35).attr("text-anchor", "middle")
      .style("font-size", "22px").style("font-weight", "bold").style("fill", "#333")
      .text("Parâmetros Climáticos e Risco de Fogo");

  const infoLabel = headerGroup.append("text").attr("y", -5).attr("text-anchor", "middle").style("font-size", "10px").style("font-weight", "bold").style("fill", "#888").text("REGISTROS EXIBIDOS");
  const infoValue = headerGroup.append("text").attr("y", 20).attr("text-anchor", "middle").style("font-size", "18px").style("font-weight", "bold").style("fill", "#222").text(`${sample_data.length} linhas`);
  const infoDetail = headerGroup.append("text").attr("y", 45).attr("text-anchor", "middle").style("font-size", "12px").style("fill", "#555").text("Use o mouse nos eixos para filtrar");

  const updateInfo = (label, value, detail, color = "#222") => {
      infoLabel.text(label.toUpperCase());
      infoValue.text(value).style("fill", color);
      infoDetail.text(detail);
  };

  const dimensions = ["latitude", "mes", "precipitacao_max", "num_dias_sem_chuva_max", "risco_fogo_max"];

  dimensions.forEach(function(d) {
    y[d] = d3.scaleLinear()
        .domain([limites[d].min, limites[d].max])
        .range([height, 0]);
  });

  x.domain(dimensions);

  // Background
  background = svg_adjusted.append("g")
      .attr("class", "background")
    .selectAll("path")
      .data(masterSample)
    .enter().append("path")
      .attr("d", path)
      .style("fill", "none").style("stroke", "#ddd").style("opacity", 0.5).style("shape-rendering", "crispEdges");

  // Foreground
  foreground = svg_adjusted.append("g")
      .attr("class", "foreground")
    .selectAll("path")
      .data(sample_data, d => d)
    .enter().append("path")
      .attr("d", path)
      .style("stroke", d => color(d.bioma))
      .style("fill", "none").style("opacity", 0.6).style("stroke-width", 1.5)
      .on("mouseover", function(event, d) {
        d3.select(this).raise().transition().duration(200).style("stroke-width", "4px").style("opacity", 1);
        updateInfo("Detalhes do Registro", `${d.estado} (${d.bioma})`, `Mês: ${d.mes} | Chuva: ${d.precipitacao_max.toFixed(0)}mm | Dias Secos: ${d.num_dias_sem_chuva_max} | Risco: ${d.risco_fogo_max.toFixed(2)}`, color(d.bioma));
      })
      .on("mouseout", function(event, d) {
         d3.select(this).transition().duration(200).style("stroke", color(d.bioma)).style("stroke-width", "1.5px").style("opacity", 0.6);
         updateInfoBoxSummary();
      });

  const g = svg_adjusted.selectAll(".dimension")
      .data(dimensions).enter().append("g")
      .attr("class", "dimension")
      .attr("transform", function(d) { return "translate(" + x(d) + ")"; });
  
  g.append("line").attr("class", "median").attr("x1", -10).attr("x2", 10)
      .attr("y1", d => y[d](d3.median(sample_data, p => +p[d])))         
      .attr("y2", d => y[d](d3.median(sample_data, p => +p[d])))
      .style("stroke", "black").style("stroke-width", 3)
      .style("opacity", sample_data.length ? 1 : 0); 

  g.append("g").attr("class", "axis")
      .each(function(d) { d3.select(this).call(d3.axisLeft(y[d])); })
    .append("text").style("text-anchor", "middle").attr("y", -9) 
      .text(d => {
         const labels = { "latitude": "Latitude", "mes": "Mês", "precipitacao_max": "Precipitação", "num_dias_sem_chuva_max": "Dias Secos", "risco_fogo_max": "Risco Fogo" };
         return labels[d] || d;
      }).style("fill", "black").style("font-weight", "bold").style("font-size", "11px").style("font-family", "sans-serif");

  g.append("g").attr("class", "brush")
      .each(function(d) { d3.select(this).call(y[d].brush = d3.brushY().extent([[-10, 0], [10, height]]).on("brush end", brush)); })
    .selectAll("rect").attr("x", -8).attr("width", 16);
  
  let activeData = sample_data; 

  function updateInfoBoxSummary() {
      const count = activeData.length;
      updateInfo("VISUALIZAÇÃO ATUAL", `${count} registros`, "Filtre nos eixos para refinar", "#222");
  }

  function path(d) {
      const valid = dimensions.every(p => !isNaN(d[p]));
      return valid ? line(dimensions.map(p => [x(p), y[p](+d[p])])) : null;
  }

  function brush(event) {   
      const actives = [];
      svg.selectAll(".brush").filter(function(d) { return d3.brushSelection(this); })
        .each(function(d) { actives.push({ dimension: d, extent: d3.brushSelection(this).map(y[d].invert) }); });
      
      const selected = [];
      foreground.style("display", function(d) {
          const isActive = actives.every(function(active) {
              const dim = active.dimension;
              let [min, max] = active.extent;
              if (min > max) [min, max] = [max, min];
              const val = +d[dim];
              return val >= min && val <= max;
          });
          if(isActive) selected.push(d);
          return (isActive) ? null : "none";
      });
      activeData = (actives.length > 0) ? selected : sample_data;
      updateInfoBoxSummary();
      svg.node().value = activeData;
      svg.dispatch("input");
  }
  
  svg.node().value = sample_data;
  return svg.node();
}


function _evolucao_anual_d3(filtroCrossfilter,configSazonalidade,data,d3,color)
{
  // Captura do filtro
  const filtro = filtroCrossfilter;
  const config = configSazonalidade;

  // Lógica de Filtragem:
  let dadosGrafico = data;
  let tituloGrafico = "Evolução Temporal dos Focos de Incêndio";
  let modoMensal = false;

  if (filtro) {
      if (filtro.tipo === "estado") {
          dadosGrafico = data.filter(d => d.estado === filtro.valor);
          tituloGrafico = `Evolução: Biomas de ${filtro.valor}`;
      } 
      else if (filtro.tipo === "bioma") {
          dadosGrafico = data.filter(d => d.bioma === filtro.valor);
          tituloGrafico = `Evolução: Bioma ${filtro.valor}`;
      }
      else if (config.agregacao === "anual" && (filtro.tipo === "ano" || (typeof filtro.valor === 'number' && filtro.valor > 1900 && filtro.valor < 2100))) {
          modoMensal = true;
          dadosGrafico = data.filter(d => +d.ano === +filtro.valor);
          tituloGrafico = `Evolução Mensal: Ano ${filtro.valor}`;
          
          if (filtro.contexto && filtro.contexto.tipo === "bioma") {
              dadosGrafico = dadosGrafico.filter(d => d.bioma === filtro.contexto.valor);
          } else if (filtro.contexto && filtro.contexto.tipo === "estado") {
               dadosGrafico = dadosGrafico.filter(d => d.estado === filtro.contexto.valor);
          }
      }
  }

  // 1. Preparação dos dados
  const getX = d => modoMensal ? +d.mes : +d.ano;
   
  const series = d3.groups(dadosGrafico, d => d.bioma).map(([name, values]) => {
    const agrupado = d3.rollups(values, v => d3.sum(v, d => d.num_deteccoes_dia), getX);
    const sortedData = agrupado.map(([xVal, total]) => ({x: xVal, total})).sort((a, b) => a.x - b.x);
    return { name: name, values: sortedData };
  });

  let xDomain;
  if (modoMensal) {
      xDomain = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; // Meses fixos
  } else {
      xDomain = Array.from(new Set(dadosGrafico.map(d => +d.ano))).sort((a, b) => a - b); // Anos disponíveis
  }

  const maxVal = d3.max(series, s => d3.max(s.values, d => d.total));

  // 2. Configuração do gráfico
  const margin = {top: 40, right: 30, bottom: 30, left: 50};
  const width = 900 - margin.left - margin.right;
  const height = 500 - margin.top - margin.bottom;

  const svg = d3.create("svg")
      .attr("viewBox", [0, 0, width + margin.left + margin.right, height + margin.top + margin.bottom])
      .style("overflow", "visible");

  const defs = svg.append("defs");
  defs.append("clipPath")
      .attr("id", "clip")
    .append("rect")
      .attr("x", 0).attr("y", 0).attr("width", width).attr("height", height);

  // Título
  svg.append("text")
      .attr("x", margin.left)
      .attr("y", 20)
      .style("font-size", "18px")
      .style("font-weight", "bold")
      .style("fill", "#333")
      .style("font-family", "sans-serif")
      .text(tituloGrafico);

  const chart = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

  // 3. Escalas
  const x = d3.scaleLinear()
      .domain(d3.extent(xDomain))
      .range([0, width]);
      
  const y = d3.scaleLinear().domain([0, maxVal]).nice().range([height, 0]);

  const mesesSigla = ["", "JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

  // 4. Eixos
  chart.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x)
          .ticks(xDomain.length)
          .tickFormat(d => modoMensal ? mesesSigla[d] : d3.format("d")(d)) 
      )
      .call(g => g.select(".domain").remove())
      .call(g => g.selectAll(".tick line").attr("stroke-opacity", 0.5));

  chart.append("g")
      .call(d3.axisLeft(y).ticks(10).tickSize(-width))
      .call(g => g.select(".domain").remove())
      .call(g => g.selectAll(".tick line").attr("stroke-opacity", 0.1).attr("stroke-dasharray", "2,2"));

  // 5. Gerador de linha
  const line = d3.line()
      .x(d => x(d.x)) 
      .y(d => y(d.total))
      .curve(d3.curveMonotoneX);

  // 6. Desenho das linhas
  const pathGroup = chart.append("g").attr("clip-path", "url(#clip)");

  pathGroup.selectAll("path")
    .data(series)
    .join("path")
      .attr("class", "line")
      .attr("fill", "none")
      .attr("stroke", d => color(d.name)) 
      .attr("stroke-width", 2.5)
      .attr("d", d => line(d.values));

  // 7. Desenho dos pontos
  pathGroup.selectAll("g.dots")
    .data(series)
    .join("g")
      .style("fill", d => color(d.name))
    .selectAll("circle")
    .data(d => d.values)
    .join("circle")
      .attr("cx", d => x(d.x)).attr("cy", d => y(d.total))
      .attr("r", 4).attr("stroke", "white").attr("stroke-width", 1.5);

  // 8. Interatividade 
  const hoverLine = chart.append("line")
      .attr("stroke", "#999").attr("stroke-width", 1).attr("stroke-dasharray", "3,3")
      .attr("y1", 0).attr("y2", height)
      .style("opacity", 0);

  const tooltipBox = chart.append("g").style("display", "none");
  
  chart.append("rect")
      .attr("width", width).attr("height", height)
      .attr("fill", "transparent")
      .on("mousemove", mousemoved)
      .on("mouseleave", left);

  function mousemoved(event) {
    const [mx] = d3.pointer(event);
    const xVal = Math.round(x.invert(mx)); 
    const index = xDomain.indexOf(xVal);
    
    if (index < 0) return;

    const boxPadding = 12;      
    const lineHeight = 20;     
    const headerHeight = 45;   
    const tooltipWidth = 190;   

    const xPos = x(xVal);
    hoverLine.attr("x1", xPos).attr("x2", xPos).style("opacity", 1);

    const valuesInYear = series
      .map(s => {
        const val = s.values.find(v => v.x === xVal);
        return { name: s.name, total: val ? val.total : 0 };
      })
      .sort((a, b) => b.total - a.total);

    tooltipBox.style("display", null);
    
    const xOffset = (xVal >= xDomain[xDomain.length - 2]) ? -tooltipWidth - 15 : 15; 
    
    tooltipBox.attr("transform", `translate(${xPos + xOffset}, 10)`);
    tooltipBox.selectAll("*").remove();
    
    const totalHeight = (valuesInYear.length * lineHeight) + headerHeight + (boxPadding / 2);

    tooltipBox.append("rect")
        .attr("width", tooltipWidth).attr("height", totalHeight)
        .attr("fill", "white")
        .attr("stroke", "#ccc")
        .attr("rx", 4)
        .style("filter", "drop-shadow(2px 2px 3px rgba(0,0,0,0.2))");

    const header = tooltipBox.append("g").attr("transform", `translate(${boxPadding}, ${boxPadding + 10})`);
    
    header.append("text")
        .style("font-weight", "bold").style("font-size", "14px").style("fill", "#333")
        .text(modoMensal ? `${mesesSigla[xVal]} de ${filtro.valor}` : `Ano de ${xVal}`);
    
    tooltipBox.append("line")
        .attr("x1", boxPadding).attr("x2", tooltipWidth - boxPadding)
        .attr("y1", 32).attr("y2", 32)
        .attr("stroke", "#eee");

    valuesInYear.forEach((v, i) => {
       const yRow = headerHeight + (i * lineHeight);
       
       const row = tooltipBox.append("g").attr("transform", `translate(${boxPadding}, ${yRow})`);
       
       row.append("circle").attr("r", 4).attr("cy", -4).attr("fill", color(v.name));
       
       row.append("text")
          .attr("x", 10).attr("y", -4)
          .attr("dy", "0.35em")
          .style("font-size", "12px").style("fill", "#555")
          .text(v.name);
          
       row.append("text")
          .attr("x", tooltipWidth - (boxPadding * 2)).attr("y", -4)
          .attr("dy", "0.35em")
          .attr("text-anchor", "end")
          .style("font-size", "12px").style("font-weight", "bold").style("fill", "#222")
          .text(v.total.toLocaleString("pt-BR"));
    });
  }

  function left() {
    hoverLine.style("opacity", 0);
    tooltipBox.style("display", "none");
  }

  return svg.node();
}


export default function define(runtime, observer) {
  const main = runtime.module();
  function toString() { return this.url; }
  const fileAttachments = new Map([
    ["uf.json", {url: new URL("./files/5f3466c5ef769813ed2ae604e93abc7a69aa82306b8a329ba1dc31994df9c88a1a25c13a2a555fa70f44c05fc1b23783f72c9c0b2b3d027a8f8fe6da89db8ca6.json", import.meta.url), mimeType: "application/json", toString}],
    ["municipio.json", {url: new URL("./files/9e0e8cd467f9a99361f7446884352c89efc58a80a73835b965e00f2949575e8fb4f2921b185bfe502ad2d696bc2fb42f5980b8892f976b4ec09a5858f7872386.json", import.meta.url), mimeType: "application/json", toString}],
    ["queimadas_visualization_subset.parquet", {url: new URL("./files/fa12f0ad7f32cdbaed8d962e6b070170c37872515a8c90f3a10de6d0a618d5d29dd5a0b2fa9913d22d6d7a317d5b74642edbe2c1eae5244eb0ea5456a8829464.bin", import.meta.url), mimeType: "application/octet-stream", toString}]
  ]);
  main.builtin("FileAttachment", runtime.fileAttachments(name => fileAttachments.get(name)));
  main.variable(observer()).define(["md"], _1);
  main.variable(observer("uf")).define("uf", ["FileAttachment"], _uf);
  main.variable(observer("municipio")).define("municipio", ["FileAttachment"], _municipio);
  main.variable(observer("queimadas_visualization_subset")).define("queimadas_visualization_subset", ["FileAttachment"], _queimadas_visualization_subset);
  main.variable(observer("db")).define("db", ["DuckDBClient","FileAttachment"], _db);
  main.variable(observer("data")).define("data", ["db"], _data);
  main.variable(observer("dados_geo")).define("dados_geo", ["require","FileAttachment"], _dados_geo);
  main.variable(observer("map_utils")).define("map_utils", ["dados_mapa"], _map_utils);
  main.variable(observer("dados_pontos")).define("dados_pontos", ["dados_mapa","dados_tempo"], _dados_pontos);
  main.variable(observer("dados_mapa")).define("dados_mapa", ["d3","data"], _dados_mapa);
  main.variable(observer("callout")).define("callout", _callout);
  main.variable(observer("color")).define("color", ["d3"], _color);
  main.define("initial filtroCrossfilter", _filtroCrossfilter);
  main.variable(observer("mutable filtroCrossfilter")).define("mutable filtroCrossfilter", ["Mutable", "initial filtroCrossfilter"], (M, _) => new M(_));
  main.variable(observer("filtroCrossfilter")).define("filtroCrossfilter", ["mutable filtroCrossfilter"], _ => _.generator);
  main.variable(observer("dados_tempo")).define("dados_tempo", ["configSazonalidade","data"], _dados_tempo);
  main.variable(observer("viewof configSazonalidade")).define("viewof configSazonalidade", ["d3","data","Event"], _configSazonalidade);
  main.variable(observer("configSazonalidade")).define("configSazonalidade", ["Generators", "viewof configSazonalidade"], (G, _) => G.input(_));
  main.variable(observer("viewof mapa")).define("viewof mapa", ["filtroCrossfilter","dados_geo","dados_mapa","dados_pontos","d3"], _mapa);
  main.variable(observer("mapa")).define("mapa", ["Generators", "viewof mapa"], (G, _) => G.input(_));
  main.variable(observer("viewof barras")).define("viewof barras", ["filtroCrossfilter","data","d3","Plot"], _barras);
  main.variable(observer("barras")).define("barras", ["Generators", "viewof barras"], (G, _) => G.input(_));
  main.variable(observer("viewof sunburst_sazonal")).define("viewof sunburst_sazonal", ["dados_tempo","configSazonalidade","d3","mutable filtroCrossfilter","color"], _sunburst_sazonal);
  main.variable(observer("sunburst_sazonal")).define("sunburst_sazonal", ["Generators", "viewof sunburst_sazonal"], (G, _) => G.input(_));
  main.variable(observer("viewof parallel_coordinates")).define("viewof parallel_coordinates", ["dados_tempo","sunburst_sazonal","d3","DOM","color"], _parallel_coordinates);
  main.variable(observer("parallel_coordinates")).define("parallel_coordinates", ["Generators", "viewof parallel_coordinates"], (G, _) => G.input(_));
  main.variable(observer("viewof evolucao_anual_d3")).define("viewof evolucao_anual_d3", ["filtroCrossfilter","configSazonalidade","data","d3","color"], _evolucao_anual_d3);
  main.variable(observer("evolucao_anual_d3")).define("evolucao_anual_d3", ["Generators", "viewof evolucao_anual_d3"], (G, _) => G.input(_));
  return main;
}
