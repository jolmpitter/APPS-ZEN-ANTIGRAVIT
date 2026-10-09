import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import bcrypt from 'bcryptjs';
import fs from 'fs';

const prisma = new PrismaClient();

const EXCEL_PATH =
  process.env.SEED_EXCEL_PATH ||
  '/home/ubuntu/Uploads/Gestao_Trafego_Profissional.xlsx';

interface ExcelRow {
  Data: string | number;
  'Valor Gasto (R$)'?: number;
  'Quantidade de Leads'?: number;
  'Quantidade de Vendas'?: number;
  'Valor Vendido (R$)'?: number;
  Gestor?: string;
  Atendente?: string;
}

interface SeedMetricRow {
  data: Date;
  gestor: string;
  atendente: string;
  valorGasto: number;
  quantidadeLeads: number;
  quantidadeVendas: number;
  valorVendido: number;
}

function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function excelSerialToDate(serial: number): Date {
  return new Date((serial - 25569) * 86400 * 1000);
}

function parseExcelDate(value: string | number): Date | null {
  if (typeof value === 'number') return excelSerialToDate(value);
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Gera dados de exemplo realistas quando a planilha do cliente não está
 * disponível, garantindo que o sistema tenha dados para exibição.
 */
function generateSampleRows(days = 60): SeedMetricRow[] {
  const gestores = ['Ana Gestora', 'Bruno Gestor'];
  const atendentes: Record<string, string[]> = {
    'Ana Gestora': ['Carla Atendente', 'Diego Atendente'],
    'Bruno Gestor': ['Eduarda Atendente', 'Felipe Atendente'],
  };

  const rows: SeedMetricRow[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const gestor of gestores) {
    for (const atendente of atendentes[gestor]) {
      for (let i = days - 1; i >= 0; i--) {
        const data = new Date(today);
        data.setDate(today.getDate() - i);

        // Fins de semana têm um volume um pouco menor.
        const weekend = data.getDay() === 0 || data.getDay() === 6;
        const base = weekend ? 0.6 : 1;

        // Sazonalidade leve + variação aleatória.
        const season = 1 + Math.sin(i / 7) * 0.15;
        const noise = 0.7 + Math.random() * 0.8;
        const factor = base * season * noise;

        const valorGasto = round(150 + Math.random() * 450 * factor, 2);
        const custoPorLead = 7 + Math.random() * 9;
        const quantidadeLeads = Math.max(1, Math.round(valorGasto / custoPorLead));
        const taxaConversao = (4 + Math.random() * 12) / 100;
        const quantidadeVendas = Math.round(quantidadeLeads * taxaConversao);
        const ticketMedio = 180 + Math.random() * 420;
        const valorVendido = round(quantidadeVendas * ticketMedio, 2);

        rows.push({
          data,
          gestor,
          atendente,
          valorGasto,
          quantidadeLeads,
          quantidadeVendas,
          valorVendido,
        });
      }
    }
  }

  return rows;
}

function readExcelRows(): SeedMetricRow[] | null {
  if (!fs.existsSync(EXCEL_PATH)) return null;

  try {
    const workbook = XLSX.readFile(EXCEL_PATH);
    const worksheet =
      workbook.Sheets['Dados Diários'] || workbook.Sheets[workbook.SheetNames[0]];
    const data: ExcelRow[] = XLSX.utils.sheet_to_json(worksheet);

    const rows: SeedMetricRow[] = [];
    for (const row of data) {
      if (!row?.Atendente || !row?.Data) continue;
      const dataDate = parseExcelDate(row.Data);
      if (!dataDate) continue;

      rows.push({
        data: dataDate,
        gestor: row.Gestor || 'Gestor Padrão',
        atendente: row.Atendente,
        valorGasto: Number(row['Valor Gasto (R$)']) || 0,
        quantidadeLeads: Number(row['Quantidade de Leads']) || 0,
        quantidadeVendas: Number(row['Quantidade de Vendas']) || 0,
        valorVendido: Number(row['Valor Vendido (R$)']) || 0,
      });
    }

    return rows.length > 0 ? rows : null;
  } catch (error) {
    console.warn('Não foi possível ler a planilha, usando dados de exemplo:', error);
    return null;
  }
}

async function main() {
  console.log('Starting seed...');

  await prisma.leadHistory.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.dailyMetric.deleteMany();
  await prisma.user.deleteMany();

  console.log('Cleared existing data');

  const hashedPassword = await bcrypt.hash('johndoe123', 10);

  const gerenteUser = await prisma.user.create({
    data: {
      name: 'John Doe',
      email: 'john@doe.com',
      password: hashedPassword,
      role: 'gerente',
    },
  });
  console.log('Created manager user (gerente): john@doe.com / johndoe123');

  const excelRows = readExcelRows();
  const sampleMode = excelRows === null;
  const rows = excelRows ?? generateSampleRows();
  console.log(
    sampleMode
      ? `Planilha não encontrada em ${EXCEL_PATH}. Gerando ${rows.length} linhas de exemplo.`
      : `Encontradas ${rows.length} linhas na planilha.`
  );

  const gestorNames = Array.from(new Set(rows.map((r) => r.gestor).filter(Boolean)));
  const atendenteNames = Array.from(new Set(rows.map((r) => r.atendente).filter(Boolean)));

  const gestorMap = new Map<string, string>();
  for (const gestorName of gestorNames) {
    const email = `${gestorName.toLowerCase().replace(/\s+/g, '.')}@empresa.com`;
    const gestor = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        name: gestorName,
        email,
        password: hashedPassword,
        role: 'gestor',
      },
    });
    gestorMap.set(gestorName, gestor.id);
    console.log(`Created gestor: ${gestorName}`);
  }

  const gestorIds = Array.from(gestorMap.values());
  const atendenteMap = new Map<string, string>();
  let atendenteIndex = 0;

  for (const atendenteName of atendenteNames) {
    const email = `${atendenteName.toLowerCase().replace(/\s+/g, '.')}@empresa.com`;
    const gestorId = gestorIds[atendenteIndex % (gestorIds.length || 1)];
    const atendente = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        name: atendenteName,
        email,
        password: hashedPassword,
        role: 'atendente',
        gestorId: gestorId || gerenteUser.id,
      },
    });
    atendenteMap.set(atendenteName, atendente.id);
    console.log(`Created atendente: ${atendenteName}`);
    atendenteIndex++;
  }

  let metricsCreated = 0;
  for (const row of rows) {
    const atendenteId = atendenteMap.get(row.atendente);
    if (!atendenteId) continue;

    const dateOnly = new Date(row.data);
    dateOnly.setHours(0, 0, 0, 0);

    const valorGasto = row.valorGasto;
    const quantidadeLeads = Math.floor(row.quantidadeLeads);
    const quantidadeVendas = Math.floor(row.quantidadeVendas);
    const valorVendido = row.valorVendido;

    const roi = valorGasto > 0 ? ((valorVendido - valorGasto) / valorGasto) * 100 : 0;
    const custoPorLead = quantidadeLeads > 0 ? valorGasto / quantidadeLeads : 0;
    const taxaConversao = quantidadeLeads > 0 ? (quantidadeVendas / quantidadeLeads) * 100 : 0;
    const ticketMedio = quantidadeVendas > 0 ? valorVendido / quantidadeVendas : 0;

    try {
      await prisma.dailyMetric.create({
        data: {
          date: dateOnly,
          userId: atendenteId,
          valorGasto,
          quantidadeLeads,
          quantidadeVendas,
          valorVendido,
          quantidadeVendasOrganicas: sampleMode ? Math.round(quantidadeVendas * 0.2) : 0,
          valorVendidoOrganico: sampleMode ? round(valorVendido * 0.15, 2) : 0,
          roi: round(roi),
          custoPorLead: round(custoPorLead),
          taxaConversao: round(taxaConversao),
          ticketMedio: round(ticketMedio),
          totalCliques: sampleMode ? Math.round(quantidadeLeads * (2 + Math.random() * 3)) : 0,
          bmName: sampleMode ? 'Gestão Zen BM' : null,
          contaAnuncio: sampleMode ? 'act_demo_001' : null,
          criativo: sampleMode ? 'Criativo Demonstração' : null,
          pagina: sampleMode ? 'Página Demonstração' : null,
          cartaoUsado: sampleMode ? 'Cartão Corporativo' : null,
        },
      });
      metricsCreated++;
    } catch (error: any) {
      // Ignora duplicidades (userId + date)
      if (error?.code !== 'P2002') throw error;
    }
  }
  console.log(`Created ${metricsCreated} daily metrics`);

  const allAtendentes = Array.from(atendenteMap.values());
  const fallbackAtendente = allAtendentes[0] || gerenteUser.id;

  const cidades: Array<[string, string]> = [
    ['São Paulo', 'SP'],
    ['Campinas', 'SP'],
    ['Rio de Janeiro', 'RJ'],
    ['Belo Horizonte', 'MG'],
    ['Curitiba', 'PR'],
    ['Porto Alegre', 'RS'],
    ['Salvador', 'BA'],
    ['Recife', 'PE'],
    ['Fortaleza', 'CE'],
    ['Florianópolis', 'SC'],
  ];

  const sources = ['Facebook Ads', 'Google Ads', 'Instagram Ads', 'TikTok Ads', 'Orgânico'];
  const statuses = ['novo', 'em_andamento', 'concluido', 'perdido'];
  const firstNames = ['Maria', 'João', 'Ana', 'Carlos', 'Patrícia', 'Ricardo', 'Fernanda', 'Roberto', 'Juliana', 'Marcos', 'Beatriz', 'Rafael', 'Camila', 'Gustavo', 'Larissa', 'Thiago'];
  const lastNames = ['Silva', 'Santos', 'Oliveira', 'Costa', 'Almeida', 'Lima', 'Souza', 'Martins', 'Pereira', 'Rodrigues'];

  const totalLeads = 40;
  let leadsCreated = 0;

  for (let i = 0; i < totalLeads; i++) {
    const atendenteId = allAtendentes[i % (allAtendentes.length || 1)] || fallbackAtendente;
    const [cidade, estado] = cidades[i % cidades.length];
    const status = statuses[i % statuses.length];
    const firstName = firstNames[i % firstNames.length];
    const lastName = lastNames[i % lastNames.length];
    const name = `${firstName} ${lastName}`;
    const valorPotencial = round(500 + Math.random() * 5000, 2);
    const valorFechado = status === 'concluido' ? round(valorPotencial * (0.7 + Math.random() * 0.3), 2) : null;

    const lead = await prisma.lead.create({
      data: {
        name,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@email.com`,
        phone: `(11) 9${String(80000000 + Math.floor(Math.random() * 19999999)).slice(0, 8)}`,
        status,
        source: sources[i % sources.length],
        valorPotencial,
        valorFechado,
        cidade,
        estado,
        notes: `Lead captado via ${sources[i % sources.length]}`,
        atendenteId,
        closedAt: status === 'concluido' || status === 'perdido' ? new Date() : null,
      },
    });

    await prisma.leadHistory.create({
      data: {
        leadId: lead.id,
        userId: atendenteId,
        action: 'lead_created',
        description: 'Lead criado e atribuído',
        newValue: 'novo',
      },
    });

    if (status !== 'novo') {
      await prisma.leadHistory.create({
        data: {
          leadId: lead.id,
          userId: atendenteId,
          action: 'status_change',
          description: `Status alterado para ${status}`,
          oldValue: 'novo',
          newValue: status,
        },
      });
    }

    leadsCreated++;
  }

  console.log(`Created ${leadsCreated} example leads`);
  console.log('Seed completed successfully!');
  console.log('Login: john@doe.com / johndoe123');
}

main()
  .catch((e) => {
    console.error('Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
