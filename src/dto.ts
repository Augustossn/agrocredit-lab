import { ApiProperty } from './openapi';
import { IsEmail,IsString,MinLength,MaxLength,Matches,IsInt,Min,Max,IsUUID,IsIn,IsOptional,IsByteLength } from 'class-validator';
import { Type,Transform } from 'class-transformer';
import { MONEY } from './domain';
export class LoginDto {
  @ApiProperty() @IsEmail() email!:string;
  @ApiProperty() @IsString() @IsByteLength(8,72) password!:string;
}
export class ProducerDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(100) name!:string;
}
export class PropertyDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(100) name!:string;
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(80) city!:string;
  @ApiProperty() @Matches(/^(?:0|[1-9]\d{0,7})\.\d{2}$/) hectares!:string;
}
export class RequestDto {
  @ApiProperty() @IsUUID() propertyId!:string;
  @ApiProperty() @Matches(MONEY) amount!:string;
  @ApiProperty() @IsString() @MinLength(5) @MaxLength(300) purpose!:string;
  @ApiProperty() @IsInt() @Min(1) @Max(120) months!:number;
  @ApiProperty() @Matches(MONEY) revenue!:string;
  @ApiProperty() @Matches(MONEY) costs!:string;
  @ApiProperty() @Matches(MONEY) debt!:string;
}
export class DecisionDto {
  @ApiProperty() @IsIn(['APPROVED','REJECTED']) status!:'APPROVED'|'REJECTED';
  @ApiProperty() @IsString() @Matches(/\S.{9,}/) @MaxLength(1000) justification!:string;
}
export class ReplayDto {
  @ApiProperty() @IsString() @Matches(/\S.{9,}/) @MaxLength(300) reason!:string;
}
export class ListDto {
  @Transform(({value})=>value===''?undefined:value) @IsOptional() @IsIn(['DRAFT','SUBMITTED','ANALYZING','APPROVED','REJECTED']) status?:any;
  @IsOptional() @IsString() @MaxLength(80) q?:string;
  @IsOptional() @Type(()=>Number) @IsInt() @Min(1) page:number=1;
  @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(50) limit:number=10;
  @IsOptional() @IsIn(['createdAt','amount']) sort:'createdAt'|'amount'='createdAt';
  @IsOptional() @IsIn(['asc','desc']) direction:'asc'|'desc'='desc';
}
